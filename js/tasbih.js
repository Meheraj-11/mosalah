(function (global) {
  'use strict';

  const PRESETS = [
    { id: 'subhanallah', ar: 'سُبْحَانَ اللَّهِ', target: 33 },
    { id: 'alhamdulillah', ar: 'الْحَمْدُ لِلَّهِ', target: 33 },
    { id: 'allahuakbar', ar: 'اللَّهُ أَكْبَرُ', target: 34 },
    { id: 'astaghfirullah', ar: 'أَسْتَغْفِرُ اللَّهَ', target: 100 },
    { id: 'lailaha', ar: 'لاَ إِلَٰهَ إِلاَّ اللَّهُ', target: 100 },
    { id: 'salawat', ar: 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', target: 100 },
    { id: 'hasbunallah', ar: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', target: 100 }
  ];

  function load() {
    return MoStorage.get('tasbih', {
      preset: 'subhanallah',
      custom: '',
      count: 0,
      target: 33,
      rounds: 0,
      vibrate: true,
      sound: true,
      today: MoUtils.todayKey(),
      todayTotal: 0,
      history: {}
    });
  }

  function save(s) { MoStorage.set('tasbih', s); return s; }

  function rollDay(s) {
    const k = MoUtils.todayKey();
    if (s.today !== k) {
      if (s.today && s.todayTotal) {
        s.history = s.history || {};
        s.history[s.today] = (s.history[s.today] || 0) + s.todayTotal;
        const keys = Object.keys(s.history).sort();
        if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (x) { delete s.history[x]; });
      }
      s.today = k;
      s.todayTotal = 0;
    }
    return s;
  }

  function tap() {
    let s = rollDay(load());
    s.count += 1;
    s.todayTotal += 1;
    if (s.vibrate !== false) MoUtils.vibrate(12);
    let completed = false;
    if (s.target > 0 && s.count >= s.target) {
      s.rounds += 1;
      completed = true;
      s.count = 0;
      if (s.sound !== false && global.MoNotify) MoNotify.playTone('soft');
      if (global.MoApp && MoApp.toast) MoApp.toast(t('dhikrComplete'), 'ok');
      MoUtils.announce(t('dhikrComplete'));
    }
    save(s);
    if (global.MoTracker) MoTracker.addDhikr(1);
    return { state: s, completed: completed };
  }

  function resetCounter() {
    const s = load();
    s.count = 0;
    save(s);
    return s;
  }

  function setPreset(id) {
    const s = load();
    const p = PRESETS.find(function (x) { return x.id === id; });
    s.preset = id;
    if (p) {
      s.target = p.target;
      s.custom = '';
    }
    s.count = 0;
    save(s);
    return s;
  }

  function setTarget(n) {
    const s = load();
    s.target = Math.max(1, Math.min(10000, Number(n) || 33));
    save(s);
    return s;
  }

  function setCustom(text) {
    const s = load();
    s.preset = 'custom';
    s.custom = String(text || '').slice(0, 120);
    save(s);
    return s;
  }

  global.MoTasbih = {
    PRESETS: PRESETS,
    load: function () { return rollDay(load()); },
    save: save,
    tap: tap,
    resetCounter: resetCounter,
    setPreset: setPreset,
    setTarget: setTarget,
    setCustom: setCustom
  };
})(window);
