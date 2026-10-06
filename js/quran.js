(function (global) {
  'use strict';

  const API = 'https://api.alquran.cloud/v1';
  const AUDIO = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/';
  let audio = null;
  let playing = null; /* { surah, ayah } */

  function editionsUrl(n) {
    return API + '/surah/' + n + '/editions/quran-uthmani,en.sahih,bn.bengali';
  }

  async function fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 18000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function getSurah(n) {
    n = Number(n);
    if (!n || n < 1 || n > 114) throw new Error('invalid');
    const cacheKey = 'surah-' + n;
    const cached = await MoStorage.getCachedQuran(cacheKey);
    if (cached && cached.ayahs && cached.ayahs.length) return cached;

    if (!MoUtils.isOnline()) {
      const err = new Error('offline');
      err.code = 'offline';
      throw err;
    }
    const json = await fetchJson(editionsUrl(n));
    if (!json || json.code !== 200 || !json.data) throw new Error('bad_response');
    const editions = Array.isArray(json.data) ? json.data : [json.data];
    const ar = editions.find(function (e) { return e.edition && /uthmani|quran/i.test(e.edition.identifier || e.edition.englishName || ''); }) || editions[0];
    const en = editions.find(function (e) { return e.edition && e.edition.identifier === 'en.sahih'; }) || editions[1];
    const bn = editions.find(function (e) { return e.edition && e.edition.identifier === 'bn.bengali'; }) || editions[2];
    const meta = window.SURAH_LIST[n - 1];
    const ayahs = (ar.ayahs || []).map(function (a, i) {
      return {
        number: a.number,
        n: a.numberInSurah,
        ar: a.text,
        en: en && en.ayahs && en.ayahs[i] ? en.ayahs[i].text : '',
        bn: bn && bn.ayahs && bn.ayahs[i] ? bn.ayahs[i].text : '',
        juz: a.juz,
        page: a.page
      };
    });
    const pack = {
      n: n,
      name: ar.name || (meta && meta.ar),
      en: (meta && meta.en) || ar.englishName,
      bn: meta && meta.bn,
      ayahs: ayahs,
      revelation: (meta && meta.r) || ar.revelationType
    };
    MoStorage.cacheQuran(cacheKey, pack);
    return pack;
  }

  async function searchText(q, lang) {
    q = String(q || '').trim();
    if (q.length < 2) return [];
    const edition = lang === 'bn' ? 'bn.bengali' : 'en.sahih';
    if (!MoUtils.isOnline()) {
      return localSurahHits(q);
    }
    try {
      const json = await fetchJson(API + '/search/' + encodeURIComponent(q) + '/all/' + edition);
      if (!json || json.code !== 200) return localSurahHits(q);
      const matches = (json.data && json.data.matches) || [];
      return matches.slice(0, 40).map(function (m) {
        return {
          type: 'ayah',
          surah: m.surah.number,
          ayah: m.numberInSurah,
          text: m.text,
          name: m.surah.englishName
        };
      });
    } catch (e) {
      return localSurahHits(q);
    }
  }

  function localSurahHits(q) {
    const s = q.toLowerCase();
    return (window.SURAH_LIST || []).filter(function (x) {
      return String(x.n) === s ||
        x.en.toLowerCase().indexOf(s) !== -1 ||
        x.ar.indexOf(q) !== -1 ||
        (x.bn && x.bn.indexOf(q) !== -1);
    }).slice(0, 20).map(function (x) {
      return { type: 'surah', surah: x.n, name: x.en, ar: x.ar, bn: x.bn, ayahs: x.ayahs };
    });
  }

  function filterSurahs(q) {
    q = String(q || '').trim().toLowerCase();
    const list = window.SURAH_LIST || [];
    if (!q) return list;
    return list.filter(function (x) {
      return String(x.n) === q ||
        x.en.toLowerCase().indexOf(q) !== -1 ||
        x.ar.indexOf(q) !== -1 ||
        (x.bn && x.bn.toLowerCase().indexOf(q) !== -1);
    });
  }

  function audioUrl(globalAyah) {
    return AUDIO + globalAyah + '.mp3';
  }

  function stopAudio() {
    if (audio) {
      try { audio.pause(); } catch (e) {}
      audio = null;
    }
    playing = null;
  }

  function playAyah(surah, ayahObj, onEvent) {
    if (!ayahObj || !ayahObj.number) return Promise.reject(new Error('no_audio'));
    stopAudio();
    audio = new Audio(audioUrl(ayahObj.number));
    audio.preload = 'auto';
    playing = { surah: surah, ayah: ayahObj.n, number: ayahObj.number };
    audio.addEventListener('ended', function () {
      const cur = playing;
      playing = null;
      if (onEvent) onEvent('ended', cur);
    });
    audio.addEventListener('error', function () {
      playing = null;
      if (onEvent) onEvent('error');
    });
    audio.addEventListener('play', function () { if (onEvent) onEvent('play', playing); });
    return audio.play();
  }

  function isPlaying(surah, n) {
    return playing && playing.surah === surah && playing.ayah === n;
  }

  function lastRead(pos) {
    if (pos) {
      MoStorage.set('lastRead', pos);
      return pos;
    }
    return MoStorage.get('lastRead', null);
  }

  global.MoQuran = {
    getSurah: getSurah,
    searchText: searchText,
    filterSurahs: filterSurahs,
    localSurahHits: localSurahHits,
    playAyah: playAyah,
    stopAudio: stopAudio,
    isPlaying: isPlaying,
    lastRead: lastRead,
    getPlaying: function () { return playing; }
  };
})(window);
