(function (global) {
  'use strict';

  /* Civil Hijri months. Actual moon sighting may differ. */
  const EVENTS = [
    { month: 1, day: 1, en: 'Islamic New Year', bn: 'হিজরি নববর্ষ', ar: 'رأس السنة الهجرية' },
    { month: 1, day: 10, en: 'Ashura', bn: 'আশুরা', ar: 'عاشوراء' },
    { month: 3, day: 12, en: 'Mawlid an-Nabi (observed in many regions)', bn: 'ঈদে মিলাদুন্নবী (অনেক অঞ্চলে পালিত)', ar: 'المولد النبوي (يُحتفل به في بلدان)' },
    { month: 7, day: 27, en: 'Isra and Mi‘raj (observed)', bn: 'শাব-এ-মিরাজ (পালিত)', ar: 'الإسراء والمعراج (مشهور)' },
    { month: 8, day: 15, en: 'Mid-Sha‘ban (observed by some)', bn: 'শাব-এ-বরাত (কিছু অঞ্চলে)', ar: 'النصف من شعبان (عند بعض أهل العلم)' },
    { month: 9, day: 1, en: 'Start of Ramadan (civil)', bn: 'রমজান শুরু (সিভিল)', ar: 'بداية رمضان (مدني)' },
    { month: 9, day: 27, en: 'Laylat al-Qadr (sought in last ten nights; 27th commonly observed)', bn: 'লাইলাতুল কদর (শেষ দশকে খোঁজা হয়; ২৭ তারিখ প্রসিদ্ধ)', ar: 'ليلة القدر (تُطلب في العشر الأواخر)' },
    { month: 10, day: 1, en: 'Eid al-Fitr (civil)', bn: 'ঈদুল ফিতর (সিভিল)', ar: 'عيد الفطر (مدني)' },
    { month: 12, day: 9, en: 'Day of Arafah', bn: 'আরাফার দিন', ar: 'يوم عرفة' },
    { month: 12, day: 10, en: 'Eid al-Adha (civil)', bn: 'ঈদুল আযহা (সিভিল)', ar: 'عيد الأضحى (مدني)' }
  ];

  function monthGrid(hy, hm) {
    const firstG = MoUtils.hijriToGregorian(hy, hm, 1);
    /* Determine length: day 30 or 29 */
    const next = hm === 12 ? MoUtils.hijriToGregorian(hy + 1, 1, 1) : MoUtils.hijriToGregorian(hy, hm + 1, 1);
    const days = Math.round((next - firstG) / 86400000);
    const startWeek = firstG.getDay();
    const cells = [];
    for (let i = 0; i < startWeek; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const g = MoUtils.hijriToGregorian(hy, hm, d);
      cells.push({ h: d, g: g, events: EVENTS.filter(function (e) { return e.month === hm && e.day === d; }) });
    }
    return { hy: hy, hm: hm, days: days, startWeek: startWeek, cells: cells, firstG: firstG };
  }

  function eventsInYear(hy) {
    return EVENTS.map(function (e) {
      const g = MoUtils.hijriToGregorian(hy, e.month, e.day);
      return Object.assign({ g: g, hy: hy }, e);
    });
  }

  function ramadanInfo(date) {
    const h = MoUtils.gregorianToHijri(date);
    const isRamadan = h.month === 9;
    const start = MoUtils.hijriToGregorian(h.month === 9 ? h.year : (h.month > 9 ? h.year + 1 : h.year), 9, 1);
    const eid = MoUtils.hijriToGregorian(h.month === 9 ? h.year : (h.month > 9 ? h.year + 1 : h.year), 10, 1);
    let dayNum = null;
    let remaining = null;
    if (isRamadan) {
      dayNum = h.day;
      remaining = Math.max(0, Math.round((eid - date) / 86400000));
    } else {
      remaining = Math.max(0, Math.round((start - date) / 86400000));
    }
    return { hijri: h, isRamadan: isRamadan, dayNum: dayNum, remaining: remaining, start: start, eid: eid };
  }

  global.MoCalendar = {
    EVENTS: EVENTS,
    monthGrid: monthGrid,
    eventsInYear: eventsInYear,
    ramadanInfo: ramadanInfo
  };
})(window);
