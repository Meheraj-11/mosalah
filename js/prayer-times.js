/* MoSalah — astronomical prayer-time engine
   Based on the widely used PrayTimes algorithm (Hamid Zarrabi-Zadeh)
   and standard solar-position formulas. Times are computed, never hard-coded. */
(function (global) {
  'use strict';

  const U = global.MoUtils;

  const METHODS = {
    MWL: {
      id: 'MWL',
      name: { en: 'Muslim World League', bn: 'মুসলিম ওয়ার্ল্ড লীগ', ar: 'رابطة العالم الإسلامي' },
      fajr: 18, isha: 17, maghrib: 0, midnight: 'Standard'
    },
    Egyptian: {
      id: 'Egyptian',
      name: { en: 'Egyptian General Authority', bn: 'মিশরীয় কর্তৃপক্ষ', ar: 'الهيئة المصرية' },
      fajr: 19.5, isha: 17.5, maghrib: 0, midnight: 'Standard'
    },
    Karachi: {
      id: 'Karachi',
      name: { en: 'University of Islamic Sciences, Karachi', bn: 'ইসলামিক সায়েন্সেস, করাচি', ar: 'جامعة العلوم الإسلامية، كراتشي' },
      fajr: 18, isha: 18, maghrib: 0, midnight: 'Standard'
    },
    UmmAlQura: {
      id: 'UmmAlQura',
      name: { en: 'Umm Al-Qura, Makkah', bn: 'উম্মুল কুরা, মক্কা', ar: 'أم القرى، مكة' },
      fajr: 18.5, ishaMin: 90, maghrib: 0, midnight: 'Standard'
    },
    Moonsighting: {
      id: 'Moonsighting',
      name: { en: 'Moonsighting Committee', bn: 'মুনসাইটিং কমিটি', ar: 'لجنة تحري الهلال' },
      fajr: 18, isha: 18, maghrib: 0, midnight: 'Standard'
    },
    ISNA: {
      id: 'ISNA',
      name: { en: 'ISNA (North America)', bn: 'আইএসএনএ (উত্তর আমেরিকা)', ar: 'إسنى' },
      fajr: 15, isha: 15, maghrib: 0, midnight: 'Standard'
    },
    Tehran: {
      id: 'Tehran',
      name: { en: 'Institute of Geophysics, Tehran', bn: 'তেহরান জিওফিজিক্স', ar: 'معهد الجيوفيزياء، طهران' },
      fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'Jafari'
    },
    Jafari: {
      id: 'Jafari',
      name: { en: 'Shia Ithna Ashari, Leva', bn: 'শিয়া ইসনা আশারি', ar: 'الشيعة الاثنا عشرية' },
      fajr: 16, isha: 14, maghrib: 4, midnight: 'Jafari'
    },
    Gulf: {
      id: 'Gulf',
      name: { en: 'Gulf region (90 min Isha)', bn: 'উপসাগরীয় অঞ্চল', ar: 'منطقة الخليج' },
      fajr: 19.5, ishaMin: 90, maghrib: 0, midnight: 'Standard'
    },
    Custom: {
      id: 'Custom',
      name: { en: 'Custom angles', bn: 'কাস্টম অ্যাঙ্গেল', ar: 'زوايا مخصصة' },
      fajr: 18, isha: 17, maghrib: 0, midnight: 'Standard'
    }
  };

  const HIGH_LAT = {
    NightMiddle: 'NightMiddle',
    AngleBased: 'AngleBased',
    OneSeventh: 'OneSeventh',
    None: 'None'
  };

  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = U.fixAngle(357.529 + 0.98560028 * D);
    const q = U.fixAngle(280.459 + 0.98564736 * D);
    const L = U.fixAngle(q + 1.915 * U.dsin(g) + 0.020 * U.dsin(2 * g));
    const e = 23.439 - 0.00000036 * D;
    const RA = U.darctan2(U.dcos(e) * U.dsin(L), U.dcos(L)) / 15;
    const eqt = q / 15 - U.fixHour(RA);
    const decl = U.darcsin(U.dsin(e) * U.dsin(L));
    return { declination: decl, equation: eqt };
  }

  function compute(date, coords, options) {
    options = options || {};
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { error: 'invalid_coords', times: null };
    }

    const methodId = options.method || 'Karachi';
    const method = Object.assign({}, METHODS[methodId] || METHODS.Karachi);
    if (methodId === 'Custom' && options.customAngles) {
      method.fajr = Number(options.customAngles.fajr) || 18;
      method.isha = Number(options.customAngles.isha) || 17;
      delete method.ishaMin;
    }

    /* Umm Al-Qura: 120 min Isha in Ramadan */
    if (methodId === 'UmmAlQura' && options.hijriMonth === 9) {
      method.ishaMin = 120;
    }

    const asrMethod = options.asrMethod === 'Hanafi' ? 2 : 1;
    const highLat = options.highLat || HIGH_LAT.NightMiddle;
    const tz = options.timezoneHours;
    const timezone = (tz == null)
      ? U.timeZoneOffsetHours(date, options.timeZone)
      : Number(tz);

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const jDate = U.julianDate(year, month, day) - lng / (15 * 24);

    function midDay(time) {
      const eqt = sunPosition(jDate + time).equation;
      return U.fixHour(12 - eqt);
    }

    function sunAngleTime(angle, time, direction) {
      const decl = sunPosition(jDate + time).declination;
      const noon = midDay(time);
      const arg = (-U.dsin(angle) - U.dsin(decl) * U.dsin(lat)) /
        (U.dcos(decl) * U.dcos(lat));
      if (Math.abs(arg) > 1) return NaN;
      const t = (1 / 15) * U.darccos(arg);
      return noon + (direction === 'ccw' ? -t : t);
    }

    function asrTime(factor, time) {
      const decl = sunPosition(jDate + time).declination;
      const angle = -U.darctan2(1, factor + U.dtan(Math.abs(lat - decl)));
      return sunAngleTime(angle, time, 'cw');
    }

    const riseSetAngle = 0.833;
    let times = {
      imsak: 5,
      fajr: 5,
      sunrise: 6,
      dhuhr: 12,
      asr: 13,
      sunset: 18,
      maghrib: 18,
      isha: 18,
      midnight: 0
    };

    for (let i = 0; i < 1; i++) {
      times.fajr = sunAngleTime(method.fajr, times.fajr / 24, 'ccw');
      times.sunrise = sunAngleTime(riseSetAngle, times.sunrise / 24, 'ccw');
      times.dhuhr = midDay(times.dhuhr / 24);
      times.asr = asrTime(asrMethod, times.asr / 24);
      times.sunset = sunAngleTime(riseSetAngle, times.sunset / 24, 'cw');
      times.maghrib = method.maghrib
        ? sunAngleTime(method.maghrib, times.maghrib / 24, 'cw')
        : times.sunset;
      if (method.ishaMin) {
        times.isha = times.maghrib + method.ishaMin / 60;
      } else {
        times.isha = sunAngleTime(method.isha, times.isha / 24, 'cw');
      }
    }

    /* High latitudes */
    const night = U.fixHour(times.sunrise - times.sunset);
    if (highLat !== HIGH_LAT.None) {
      times.fajr = adjustHighLat(times.fajr, times.sunrise, method.fajr, night, 'ccw', highLat);
      if (!method.ishaMin) {
        times.isha = adjustHighLat(times.isha, times.sunset, method.isha || 18, night, 'cw', highLat);
      }
      if (method.maghrib) {
        times.maghrib = adjustHighLat(times.maghrib, times.sunset, method.maghrib, night, 'cw', highLat);
      }
    }

    if (method.midnight === 'Jafari') {
      const nightPortion = U.fixHour(times.fajr - times.sunset);
      times.midnight = times.sunset + nightPortion / 2;
    } else {
      times.midnight = times.sunset + U.fixHour(times.sunrise + 24 - times.sunset) / 2;
    }

    /* Convert to local timezone */
    const offset = timezone - lng / 15;
    const keys = ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha', 'midnight'];
    const out = {};
    keys.forEach(function (k) {
      let h = times[k] + offset;
      if (k === 'midnight' && h >= 24) h -= 24;
      out[k] = U.fixHour(h);
    });

    /* Manual minute adjustments */
    const adj = options.adjustments || {};
    ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(function (k) {
      const m = Number(adj[k]) || 0;
      if (m) out[k] = U.fixHour(out[k] + m / 60);
    });

    if (!isValid(out)) {
      return { error: 'calc_failed', times: null, raw: out };
    }
    return { error: null, times: out, method: method, timezone: timezone };
  }

  function adjustHighLat(time, base, angle, night, direction, method) {
    const portion = nightPortion(angle, night, method);
    const diff = direction === 'ccw' ? U.fixHour(base - time) : U.fixHour(time - base);
    if (isNaN(time) || diff > portion) {
      return direction === 'ccw' ? base - portion : base + portion;
    }
    return time;
  }

  function nightPortion(angle, night, method) {
    if (method === HIGH_LAT.AngleBased) return night * angle / 60;
    if (method === HIGH_LAT.OneSeventh) return night / 7;
    return night / 2;
  }

  function isValid(t) {
    const seq = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];
    for (let i = 0; i < seq.length; i++) {
      if (t[seq[i]] == null || isNaN(t[seq[i]])) return false;
    }
    /* Allow midnight wrap but require daytime order */
    if (!(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib <= t.isha + 0.0001 || t.isha < t.fajr)) {
      /* Maghrib should be >= sunset-ish and before isha, unless isha wraps */
      if (!(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.sunset)) return false;
    }
    const spanDay = t.isha > t.fajr ? t.isha - t.fajr : 24;
    if (spanDay < 4 || spanDay > 22) return false;
    return true;
  }

  function nextPrayer(times, nowHours, names) {
    names = names || ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (let i = 0; i < names.length; i++) {
      if (times[names[i]] > nowHours + 1 / 3600) {
        return { name: names[i], time: times[names[i]], index: i };
      }
    }
    return { name: names[0], time: times[names[0]] + 24, index: 0, tomorrow: true };
  }

  function currentPrayer(times, nowHours) {
    const names = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    let cur = 'isha';
    for (let i = 0; i < names.length; i++) {
      if (nowHours >= times[names[i]]) cur = names[i];
    }
    /* After midnight before fajr → isha (previous) */
    if (nowHours < times.fajr) cur = 'isha';
    return cur;
  }

  function hoursNow(date) {
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / 3600000;
  }

  global.PrayerEngine = {
    METHODS: METHODS,
    HIGH_LAT: HIGH_LAT,
    compute: compute,
    nextPrayer: nextPrayer,
    currentPrayer: currentPrayer,
    hoursNow: hoursNow,
    isValid: isValid
  };
})(window);
