(function (global) {
  'use strict';

  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  function emptyDay() {
    return { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false, quran: 0, dhikr: 0, dua: false, fast: false };
  }

  function loadAll() {
    return MoStorage.get('tracker', {});
  }
  function saveAll(d) { MoStorage.set('tracker', d); }

  function day(key) {
    const all = loadAll();
    if (!all[key]) all[key] = emptyDay();
    return { all: all, rec: all[key], key: key };
  }

  function today() { return day(MoUtils.todayKey()); }

  function togglePrayer(name, key) {
    const d = day(key || MoUtils.todayKey());
    d.rec[name] = !d.rec[name];
    saveAll(d.all);
    return d.rec;
  }

  function setPrayer(name, val, key) {
    const d = day(key || MoUtils.todayKey());
    d.rec[name] = !!val;
    saveAll(d.all);
    return d.rec;
  }

  function addQuran(n, key) {
    const d = day(key || MoUtils.todayKey());
    d.rec.quran = (d.rec.quran || 0) + (n || 1);
    saveAll(d.all);
    return d.rec;
  }

  function addDhikr(n, key) {
    const d = day(key || MoUtils.todayKey());
    d.rec.dhikr = (d.rec.dhikr || 0) + (n || 1);
    saveAll(d.all);
    return d.rec;
  }

  function toggleDua(key) {
    const d = day(key || MoUtils.todayKey());
    d.rec.dua = !d.rec.dua;
    saveAll(d.all);
    return d.rec;
  }

  function toggleFast(key) {
    const d = day(key || MoUtils.todayKey());
    d.rec.fast = !d.rec.fast;
    saveAll(d.all);
    return d.rec;
  }

  function score(rec) {
    rec = rec || emptyDay();
    let s = 0;
    PRAYERS.forEach(function (p) { if (rec[p]) s += 1; });
    if (rec.quran > 0) s += 1;
    if (rec.dhikr > 0) s += 1;
    if (rec.dua) s += 1;
    return { done: s, total: 8, pct: Math.round((s / 8) * 100) };
  }

  function range(fromDate, days) {
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() - (days - 1 - i));
      const k = MoUtils.todayKey(d);
      const all = loadAll();
      const rec = all[k] || emptyDay();
      out.push({ date: k, rec: rec, score: score(rec) });
    }
    return out;
  }

  function week() {
    return range(new Date(), 7);
  }

  function month() {
    return range(new Date(), 30);
  }

  function streak() {
    const all = loadAll();
    let n = 0;
    const d = new Date();
    /* Do not break streak for today if still in progress */
    for (let i = 0; i < 400; i++) {
      const k = MoUtils.todayKey(d);
      const rec = all[k];
      const prayed = rec && PRAYERS.filter(function (p) { return rec[p]; }).length;
      if (i === 0 && (!prayed || prayed === 0)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (prayed && prayed >= 1) {
        n += 1;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return n;
  }

  global.MoTracker = {
    PRAYERS: PRAYERS,
    emptyDay: emptyDay,
    today: today,
    day: day,
    togglePrayer: togglePrayer,
    setPrayer: setPrayer,
    addQuran: addQuran,
    addDhikr: addDhikr,
    toggleDua: toggleDua,
    toggleFast: toggleFast,
    score: score,
    week: week,
    month: month,
    streak: streak,
    loadAll: loadAll
  };
})(window);
