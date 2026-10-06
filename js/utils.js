/* MoSalah — shared helpers */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  function pad(n, w) {
    n = String(Math.floor(Math.abs(n)));
    while (n.length < (w || 2)) n = '0' + n;
    return n;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(el, ev, fn, opts) {
    if (!el) return function () {};
    el.addEventListener(ev, fn, opts);
    return function () { el.removeEventListener(ev, fn, opts); };
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0, timer;
    return function () {
      const now = Date.now(), ctx = this, args = arguments;
      const remaining = ms - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        last = now;
        fn.apply(ctx, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(function () {
          last = Date.now();
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  }

  function dsin(d) { return Math.sin(d * DEG); }
  function dcos(d) { return Math.cos(d * DEG); }
  function dtan(d) { return Math.tan(d * DEG); }
  function darcsin(x) { return Math.asin(x) * RAD; }
  function darccos(x) { return Math.acos(clamp(x, -1, 1)) * RAD; }
  function darctan2(y, x) { return Math.atan2(y, x) * RAD; }

  function fixAngle(a) {
    a = a - 360 * Math.floor(a / 360);
    return a < 0 ? a + 360 : a;
  }

  function fixHour(a) {
    a = a - 24 * Math.floor(a / 24);
    return a < 0 ? a + 24 : a;
  }

  function julianDate(year, month, day) {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  function timeZoneOffsetHours(date, timeZone) {
    if (!timeZone) return -date.getTimezoneOffset() / 60;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
      });
      const parts = fmt.formatToParts(date);
      const get = function (t) {
        const p = parts.find(function (x) { return x.type === t; });
        return p ? p.value : '0';
      };
      const asUTC = Date.UTC(
        Number(get('year')), Number(get('month')) - 1, Number(get('day')),
        Number(get('hour') === '24' ? 0 : get('hour')), Number(get('minute')), Number(get('second'))
      );
      return (asUTC - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds())) / 3600000;
    } catch (e) {
      return -date.getTimezoneOffset() / 60;
    }
  }

  function formatTime(hours, fmt, am, pm) {
    if (hours == null || isNaN(hours)) return '--:--';
    hours = fixHour(hours + 0.5 / 60);
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    if (fmt === '24') return pad(h) + ':' + pad(m);
    const h12 = (h % 12) || 12;
    const suffix = h < 12 ? (am || 'AM') : (pm || 'PM');
    return h12 + ':' + pad(m) + ' ' + suffix;
  }

  function hoursToDate(baseDate, hours) {
    if (hours == null || isNaN(hours)) return null;
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
    d.setTime(d.getTime() + Math.round(hours * 3600000));
    return d;
  }

  function formatDuration(ms, t) {
    if (ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  }

  function formatGregorian(date, locale) {
    try {
      return new Intl.DateTimeFormat(locale || 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(date);
    } catch (e) {
      return date.toDateString();
    }
  }

  function formatClock(date, fmt) {
    const h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    if (fmt === '24') return pad(h) + ':' + pad(m) + ':' + pad(s);
    const h12 = (h % 12) || 12;
    const ap = h < 12 ? 'AM' : 'PM';
    return pad(h12) + ':' + pad(m) + ':' + pad(s) + ' ' + ap;
  }

  /* Kuwaiti / civil Hijri conversion (tabular). Lunar dates may differ by moon sighting. */
  function gregorianToHijri(date) {
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();
    let jd;
    if (year > 1582 || (year === 1582 && month > 10) || (year === 1582 && month === 10 && day > 14)) {
      const a = Math.floor((14 - month) / 12);
      const y = year + 4800 - a;
      const m = month + 12 * a - 3;
      jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    } else {
      const a = Math.floor((14 - month) / 12);
      const y = year + 4800 - a;
      const m = month + 12 * a - 3;
      jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    }
    const l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
    const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const hm = Math.floor((24 * l3) / 709);
    const hd = l3 - Math.floor((709 * hm) / 24);
    const hy = 30 * n + j - 30;
    return { year: hy, month: hm, day: hd, jd: jd };
  }

  function hijriToGregorian(hy, hm, hd) {
    const jd = Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm - Math.floor((hm - 1) / 2) + hd + 1948440 - 385;
    let l = jd + 68569;
    const n = Math.floor((4 * l) / 146097);
    l = l - Math.floor((146097 * n + 3) / 4);
    const i = Math.floor((4000 * (l + 1)) / 1461001);
    l = l - Math.floor((1461 * i) / 4) + 31;
    const j = Math.floor((80 * l) / 2447);
    const d = l - Math.floor((2447 * j) / 80);
    l = Math.floor(j / 11);
    const m = j + 2 - 12 * l;
    const y = 100 * (n - 49) + i + l;
    return new Date(y, m - 1, d);
  }

  const HIJRI_MONTHS_EN = ['Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah'];
  const HIJRI_MONTHS_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  const HIJRI_MONTHS_BN = ['মুহাররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি', 'জমাদিউল আউয়াল', 'জমাদিউস সানি', 'রজব', 'শাবান', 'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'];

  function formatHijri(h, lang) {
    const months = lang === 'ar' ? HIJRI_MONTHS_AR : lang === 'bn' ? HIJRI_MONTHS_BN : HIJRI_MONTHS_EN;
    const month = months[h.month - 1] || '';
    if (lang === 'ar') return h.day + ' ' + month + ' ' + h.year + ' هـ';
    if (lang === 'bn') return toBnNum(h.day) + ' ' + month + ' ' + toBnNum(h.year) + ' হিজরি';
    return h.day + ' ' + month + ' ' + h.year + ' AH';
  }

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  function toBnNum(n) {
    return String(n).replace(/\d/g, function (d) { return BN_DIGITS[d]; });
  }
  function localizeNumber(n, lang) {
    if (lang === 'bn') return toBnNum(n);
    if (lang === 'ar') {
      const AR = '٠١٢٣٤٥٦٧٨٩';
      return String(n).replace(/\d/g, function (d) { return AR[d]; });
    }
    return String(n);
  }

  /* Qibla from lat/lng. Kaaba: 21.4224779, 39.8251832 */
  const KAABA = { lat: 21.4224779, lng: 39.8251832 };

  function qiblaBearing(lat, lng) {
    const φ1 = lat * DEG;
    const φ2 = KAABA.lat * DEG;
    const Δλ = (KAABA.lng - lng) * DEG;
    const y = Math.sin(Δλ);
    const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
    return fixAngle(Math.atan2(y, x) * RAD);
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dφ = (lat2 - lat1) * DEG;
    const dλ = (lng2 - lng1) * DEG;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  async function shareText(title, text) {
    if (navigator.share) {
      try {
        await navigator.share({ title: title, text: text });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
      }
    }
    await copyText(text);
    return 'copied';
  }

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 12);
    } catch (e) {}
  }

  function isOnline() {
    return navigator.onLine !== false;
  }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function todayKey(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function announce(msg) {
    const el = document.getElementById('sr-live');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 40);
  }

  function safeJsonParse(s, fallback) {
    try {
      if (!s) return fallback;
      const v = JSON.parse(s);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  global.MoUtils = {
    pad: pad, clamp: clamp, escapeHtml: escapeHtml, $: $, $$: $$, on: on,
    debounce: debounce, throttle: throttle,
    dsin: dsin, dcos: dcos, dtan: dtan, darcsin: darcsin, darccos: darccos, darctan2: darctan2,
    fixAngle: fixAngle, fixHour: fixHour, julianDate: julianDate,
    timeZoneOffsetHours: timeZoneOffsetHours, formatTime: formatTime, hoursToDate: hoursToDate,
    formatDuration: formatDuration, formatGregorian: formatGregorian, formatClock: formatClock,
    gregorianToHijri: gregorianToHijri, hijriToGregorian: hijriToGregorian,
    HIJRI_MONTHS_EN: HIJRI_MONTHS_EN, HIJRI_MONTHS_AR: HIJRI_MONTHS_AR, HIJRI_MONTHS_BN: HIJRI_MONTHS_BN,
    formatHijri: formatHijri, toBnNum: toBnNum, localizeNumber: localizeNumber,
    KAABA: KAABA, qiblaBearing: qiblaBearing, haversineKm: haversineKm,
    copyText: copyText, shareText: shareText, vibrate: vibrate, isOnline: isOnline, uuid: uuid,
    todayKey: todayKey, sameDay: sameDay, announce: announce, safeJsonParse: safeJsonParse,
    download: download
  };
})(window);
