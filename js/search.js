(function (global) {
  'use strict';

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^\w\u0980-\u09FF\u0600-\u06FF]+/g, ' ').trim();
  }

  function hit(hay, q) {
    return norm(hay).indexOf(q) !== -1;
  }

  function search(query) {
    const q = norm(query);
    if (q.length < 2) return [];
    const out = [];
    const lang = (global.MoI18n && MoI18n.lang) || 'en';

    (window.SURAH_LIST || []).forEach(function (s) {
      if (hit(s.en, q) || hit(s.ar, q) || hit(s.bn, q) || String(s.n) === q) {
        out.push({ type: 'quran', id: 's' + s.n, title: s.n + '. ' + (lang === 'bn' ? s.bn : lang === 'ar' ? s.ar : s.en), sub: s.ar, href: '#/quran/' + s.n });
      }
    });

    (window.HADITH_DATA || []).forEach(function (h) {
      if (hit(h.en, q) || hit(h.bn, q) || hit(h.ar, q) || hit(h.collection, q) || hit(h.cat, q)) {
        out.push({ type: 'hadith', id: h.id, title: (lang === 'bn' ? h.bn : lang === 'ar' ? h.ar : h.en).slice(0, 110) + '…', sub: h.collection + ' ' + h.ref, href: '#/hadith/' + h.id });
      }
    });

    (window.DUA_DATA || []).forEach(function (d) {
      const title = d.title ? (d.title[lang] || d.title.en) : '';
      if (hit(title, q) || hit(d.en, q) || hit(d.bn, q) || hit(d.ar, q) || hit(d.cat, q) || hit(d.ref, q)) {
        out.push({ type: 'dua', id: d.id, title: title || d.ar.slice(0, 60), sub: d.ref, href: '#/dua/' + d.id });
      }
    });

    const guides = [
      { id: 'wudu', keys: 'wudu ablution ozu ওযু وضوء', href: '#/learn/wudu', titleKey: 'wuduTitle' },
      { id: 'fajr', keys: 'fajr dawn ফজر الفجر salah namaz', href: '#/learn/fajr', titleKey: 'fajr' },
      { id: 'dhuhr', keys: 'dhuhr zuhr যোহর الظهر', href: '#/learn/dhuhr', titleKey: 'dhuhr' },
      { id: 'asr', keys: 'asr আসর العصر', href: '#/learn/asr', titleKey: 'asr' },
      { id: 'maghrib', keys: 'maghrib মাগরিব المغرب', href: '#/learn/maghrib', titleKey: 'maghrib' },
      { id: 'isha', keys: 'isha এশা العشاء', href: '#/learn/isha', titleKey: 'isha' },
      { id: 'witr', keys: 'witr বিতর الوتر', href: '#/learn/witr', titleKey: 'witr' },
      { id: 'recitations', keys: 'fatiha tashahhud durood recitation কিরাআত', href: '#/learn/recitations', titleKey: 'recitationsTitle' },
      { id: 'mistakes', keys: 'mistakes ভুল errors', href: '#/learn/mistakes', titleKey: 'commonMistakesTitle' }
    ];
    guides.forEach(function (g) {
      if (hit(g.keys, q) || hit(t(g.titleKey), q)) {
        out.push({ type: 'guide', id: g.id, title: t(g.titleKey), sub: t('catGuide'), href: g.href });
      }
    });

    const pages = [
      { href: '#/qibla', titleKey: 'qibla', keys: 'qibla kibla compass কাবা قبلة' },
      { href: '#/tasbih', titleKey: 'tasbih', keys: 'tasbih dhikr counter তাসবিহ تسبيح' },
      { href: '#/zakat', titleKey: 'zakat', keys: 'zakat nisab যাকাত زكاة' },
      { href: '#/calendar', titleKey: 'calendar', keys: 'hijri calendar রমজান' },
      { href: '#/ramadan', titleKey: 'ramadan', keys: 'ramadan sehri iftar রোজা' },
      { href: '#/tracker', titleKey: 'tracker', keys: 'tracker ibadah streak' },
      { href: '#/settings', titleKey: 'settings', keys: 'settings theme language' }
    ];
    pages.forEach(function (p) {
      if (hit(p.keys, q) || hit(t(p.titleKey), q)) {
        out.push({ type: 'page', id: p.href, title: t(p.titleKey), sub: t('pages'), href: p.href });
      }
    });

    return out.slice(0, 50);
  }

  global.MoSearch = { search: search, filterSurahs: function (q) { return global.MoQuran ? MoQuran.filterSurahs(q) : []; } };
})(window);
