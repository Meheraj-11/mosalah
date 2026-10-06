/* MoSalah application controller */
(function () {
  'use strict';

  const U = MoUtils;
  const esc = U.escapeHtml;
  const DEFAULT_GEO = { name: 'Chattogram', country: 'Bangladesh', bn: 'চট্টগ্রাম', lat: 22.3569, lng: 91.7832, tz: 'Asia/Dhaka', source: 'fallback' };
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const EXTRA = ['imsak', 'sunrise', 'sunset', 'midnight'];

  let settings;
  let geo = DEFAULT_GEO;
  let prayerRes = null;
  let tomorrowRes = null;
  let route = { name: 'dashboard', parts: [] };
  let lastDay = '';
  let deferredPrompt = null;
  let qiblaHeading = null;
  let searchTimer = 0;

  function t(k, p) { return MoI18n.t(k, p); }

  function icon(id, s) {
    s = s || 20;
    return '<svg width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }

  function fmtTime(hours) {
    if (hours == null || isNaN(hours)) return '--:--';
    return U.formatTime(hours, settings.timeFormat, t('am'), t('pm'));
  }

  function locLabel() {
    if (!geo) return '—';
    if (MoI18n.lang === 'bn' && geo.bn) return geo.bn + (geo.country ? ', ' + geo.country : '');
    return (geo.name || '') + (geo.country ? ', ' + geo.country : '');
  }

  function toast(msg, kind) {
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function closeModal() {
    const r = document.getElementById('modal-root');
    r.innerHTML = '';
  }

  function modal(html) {
    const r = document.getElementById('modal-root');
    r.innerHTML = '<div class="modal-back" role="dialog" aria-modal="true"><div class="modal">' + html + '</div></div>';
    r.querySelector('.modal-back').addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-back')) closeModal();
    });
  }

  function bookmarks() { return MoStorage.get('bookmarks', []); }
  function isBm(type, id) {
    return bookmarks().some(function (b) { return b.type === type && b.id === id; });
  }
  function toggleBm(item) {
    let list = bookmarks();
    const i = list.findIndex(function (b) { return b.type === item.type && b.id === item.id; });
    if (i >= 0) { list.splice(i, 1); toast(t('removedBookmark')); }
    else { list.unshift(item); toast(t('ayahBookmark')); }
    MoStorage.set('bookmarks', list.slice(0, 400));
    return i < 0;
  }

  function applyTheme() {
    const th = settings.theme || 'system';
    document.documentElement.setAttribute('data-theme', th);
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = th === 'dark' || (th === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (meta) meta.setAttribute('content', dark ? '#0a110f' : '#0b5c4a');
  }

  function applyLang() {
    MoI18n.setLang(settings.lang || 'en');
    document.body.style.setProperty('--ar-size', (settings.quran && settings.quran.arabicSize || 28) + 'px');
  }

  function saveSettings() {
    MoStorage.saveSettings(settings);
  }

  function computeFor(date) {
    const h = U.gregorianToHijri(date);
    return PrayerEngine.compute(date, { lat: geo.lat, lng: geo.lng }, {
      method: settings.method || 'Karachi',
      asrMethod: settings.asrMethod || 'Hanafi',
      highLat: settings.highLat || 'NightMiddle',
      adjustments: settings.adjustments || {},
      customAngles: settings.customAngles,
      timeZone: geo.tz,
      hijriMonth: h.month
    });
  }

  function recompute() {
    const now = new Date();
    prayerRes = computeFor(now);
    const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    tomorrowRes = computeFor(tom);
    if (prayerRes && prayerRes.times) MoNotify.schedule(prayerRes.times, now);
    lastDay = U.todayKey(now);
    const dash = document.getElementById('view-dashboard');
    if (dash) dash.removeAttribute('data-ready');
    refreshOpenView(false);
  }

  function nextInfo(now) {
    if (!prayerRes || !prayerRes.times) return null;
    const hours = PrayerEngine.hoursNow(now);
    const n = PrayerEngine.nextPrayer(prayerRes.times, hours, PRAYERS);
    let when = U.hoursToDate(now, n.tomorrow ? n.time - 24 : n.time);
    if (n.tomorrow && tomorrowRes && tomorrowRes.times) {
      when = U.hoursToDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), tomorrowRes.times[n.name]);
    }
    return { name: n.name, when: when, tomorrow: !!n.tomorrow };
  }

  /* ---------- routing ---------- */
  function parseRoute() {
    const raw = (window.location.hash || '#/').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const name = parts[0] || 'dashboard';
    return { name: name, parts: parts };
  }

  function navigate(hash) {
    if (hash.charAt(0) !== '#') hash = '#/' + hash.replace(/^\//, '');
    if (window.location.hash === hash) onRoute();
    else window.location.hash = hash;
  }

  function showView(id) {
    U.$$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + id); });
    const back = document.getElementById('btn-back');
    back.hidden = id === 'dashboard';
  }

  function onRoute() {
    route = parseRoute();
    const map = {
      '': 'dashboard', dashboard: 'dashboard',
      quran: 'quran', qibla: 'qibla', tasbih: 'tasbih',
      hadith: 'hadith', dua: 'dua', learn: 'learn',
      tracker: 'tracker', calendar: 'calendar', zakat: 'zakat',
      ramadan: 'ramadan', bookmarks: 'bookmarks', settings: 'settings',
      search: 'search', more: 'more', about: 'about'
    };
    const view = map[route.name] || 'dashboard';
    showView(view);
    highlightNav(view);
    refreshOpenView(false);
    window.scrollTo(0, 0);
    if (view !== 'qibla') MoQibla.stop();
    if (view !== 'quran') MoQuran.stopAudio();
  }

  function refreshOpenView(fromTick) {
    const n = route.name || 'dashboard';
    if (n === 'dashboard' || n === '') renderDashboard(fromTick);
    else if (n === 'quran') renderQuran();
    else if (n === 'qibla') renderQibla();
    else if (n === 'tasbih') renderTasbih();
    else if (n === 'hadith') renderHadith();
    else if (n === 'dua') renderDua();
    else if (n === 'learn') renderLearn();
    else if (n === 'tracker') renderTracker();
    else if (n === 'calendar') renderCalendar();
    else if (n === 'zakat') renderZakat();
    else if (n === 'ramadan') renderRamadan();
    else if (n === 'bookmarks') renderBookmarks();
    else if (n === 'settings') renderSettings();
    else if (n === 'search') renderSearch();
    else if (n === 'more') renderMore();
    else if (n === 'about') renderAbout();
  }

  function navItems() {
    return [
      { href: '#/', id: 'dashboard', key: 'home', icon: 'home' },
      { href: '#/quran', id: 'quran', key: 'quran', icon: 'quran' },
      { href: '#/qibla', id: 'qibla', key: 'qibla', icon: 'qibla' },
      { href: '#/tasbih', id: 'tasbih', key: 'tasbih', icon: 'tasbih' },
      { href: '#/more', id: 'more', key: 'more', icon: 'more' }
    ];
  }

  function moreItems() {
    return [
      { href: '#/hadith', key: 'hadith', bn: 'হাদিস', en: 'Hadith' },
      { href: '#/dua', key: 'dua', bn: 'দোয়া ও আযকার', en: 'Dua & Adhkar' },
      { href: '#/learn', key: 'learn', bn: 'সালাত শিক্ষা', en: 'Learn Salah' },
      { href: '#/tracker', key: 'tracker', bn: 'ইবাদত ট্র্যাকার', en: 'Ibadah Tracker' },
      { href: '#/calendar', key: 'calendar', bn: 'ইসলামি ক্যালেন্ডার', en: 'Islamic Calendar' },
      { href: '#/zakat', key: 'zakat', bn: 'যাকাত ক্যালকুলেটর', en: 'Zakat Calculator' },
      { href: '#/ramadan', key: 'ramadan', bn: 'রমজান', en: 'Ramadan' },
      { href: '#/bookmarks', key: 'bookmarks', bn: 'বুকমার্ক', en: 'Bookmarks' },
      { href: '#/search', key: 'search', bn: 'খুঁজুন', en: 'Search' },
      { href: '#/settings', key: 'settings', bn: 'সেটিংস', en: 'Settings' },
      { href: '#/about', key: 'about', bn: 'সম্পর্কে', en: 'About' }
    ];
  }

  function renderChrome() {
    const side = document.getElementById('sidebar');
    let html = '<div class="brand" style="margin:4px 8px 16px">' + icon('home', 28) + '<span class="brand-text"><span>' + esc(t('appName')) + '</span><small>' + esc(t('tagline')) + '</small></span></div>';
    html += '<div class="nav-label">' + esc(t('dashboard')) + '</div>';
    navItems().filter(function (x) { return x.id !== 'more'; }).forEach(function (it) {
      html += '<a href="' + it.href + '" data-nav="' + it.id + '">' + icon(it.icon) + '<span>' + esc(t(it.key)) + '</span></a>';
    });
    html += '<div class="nav-label">' + esc(t('moreTools')) + '</div>';
    moreItems().forEach(function (it) {
      html += '<a href="' + it.href + '" class="side-more"><span>' + esc(it.bn) + '</span><small>' + esc(it.en) + '</small></a>';
    });
    side.innerHTML = html;

    const bot = document.getElementById('bottom-nav');
    bot.innerHTML = navItems().map(function (it) {
      return '<a href="' + it.href + '" data-nav="' + it.id + '">' + icon(it.icon, 22) + '<span>' + esc(t(it.key)) + '</span></a>';
    }).join('');
  }

  function highlightNav(view) {
    const id = (view === 'dashboard') ? 'dashboard' : (['quran', 'qibla', 'tasbih'].indexOf(view) >= 0 ? view : 'more');
    U.$$('[data-nav]').forEach(function (a) {
      const on = a.getAttribute('data-nav') === id;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---------- dashboard ---------- */
  function renderDashboard(fromTick) {
    const el = document.getElementById('view-dashboard');
    const now = new Date();
    const hij = U.gregorianToHijri(now);
    const next = nextInfo(now);
    const rec = MoTracker.today().rec;
    const sc = MoTracker.score(rec);
    const ram = MoCalendar.ramadanInfo(now);
    const reminders = t('reminders');
    const rem = reminders[now.getDate() % reminders.length];
    const last = MoQuran.lastRead();
    const tas = MoTasbih.load();
    const ms = next && next.when ? next.when.getTime() - now.getTime() : 0;

    if (fromTick && el.getAttribute('data-ready') === '1') {
      const clock = el.querySelector('[data-clock]');
      const cd = el.querySelector('[data-cd]');
      if (clock) clock.textContent = U.formatClock(now, settings.timeFormat);
      if (cd) cd.textContent = U.formatDuration(ms);
      return;
    }

    let err = '';
    if (!prayerRes || prayerRes.error || !prayerRes.times) {
      err = '<div class="error-box">' + esc(t('calcError')) + '</div>';
    }
    const times = (prayerRes && prayerRes.times) || {};
    const cur = times.fajr != null ? PrayerEngine.currentPrayer(times, PrayerEngine.hoursNow(now)) : '';

    let cards = PRAYERS.map(function (p) {
      const isNext = next && next.name === p && !next.tomorrow;
      const prayed = !!rec[p];
      const nOn = settings.notifications && settings.notifications[p] !== false && settings.notifications.enabled;
      let status = prayed ? t('prayed') : (isNext ? t('upcoming') : (p === cur ? t('current') : t('notPrayed')));
      return '<article class="prayer-card' + (isNext ? ' next' : '') + '" data-p="' + p + '">' +
        '<div class="bar"></div>' +
        '<div><div class="pname">' + esc(t(p)) + '</div><div class="faint">' + esc(status) + '</div></div>' +
        '<div class="ptime">' + esc(fmtTime(times[p])) + '</div>' +
        '<div class="row">' +
        '<button class="bell-mini' + (nOn ? ' on' : '') + '" data-bell="' + p + '" aria-label="' + esc(t('notifications')) + '">🔔</button>' +
        '<button class="check' + (prayed ? ' on' : '') + '" data-check="' + p + '" aria-pressed="' + prayed + '" aria-label="' + esc(t('markPrayed')) + '">' + (prayed ? '✓' : '') + '</button>' +
        '</div></article>';
    }).join('');

    const extras = EXTRA.map(function (k) {
      return '<div class="spread faint"><span>' + esc(t(k)) + '</span><span class="ltr-keep">' + esc(fmtTime(times[k])) + '</span></div>';
    }).join('');

    const qPct = Math.min(100, (rec.quran || 0) * 5);
    const dPct = Math.min(100, ((tas.todayTotal || rec.dhikr || 0) / 100) * 100);

    el.innerHTML =
      (geo.source === 'fallback' ? '<div class="note-box" style="margin-bottom:10px">' + esc(t('fallbackLoc')) + ' <button class="btn ghost" data-open-loc type="button">' + esc(t('changeLocation')) + '</button></div>' : '') +
      '<section class="card hero">' +
        '<div class="spread"><button class="loc" data-open-loc type="button" style="background:none;border:0;color:inherit">' + icon('pin', 16) + ' ' + esc(locLabel()) + '</button>' +
        (ram.isRamadan ? '<span class="badge-ramadan">' + esc(t('ramadanMubarak')) + '</span>' : '') + '</div>' +
        '<div class="dates"><strong>' + esc(U.formatGregorian(now, MoI18n.locale())) + '</strong>' +
        '<span>' + esc(U.formatHijri(hij, MoI18n.lang)) + '</span></div>' +
        '<div class="clock ltr-keep" data-clock>' + esc(U.formatClock(now, settings.timeFormat)) + '</div>' +
        (next ? '<div class="next-label">' + esc(t('nextSalah')) + (next.tomorrow ? ' · ' + esc(t('tomorrow')) : '') + '</div>' +
        '<div class="next-name">' + esc(t(next.name)) + '</div>' +
        '<div class="countdown ltr-keep" data-cd>' + esc(U.formatDuration(ms)) + '</div>' : '') +
      '</section>' +
      (ram.isRamadan ? '<a class="card" href="#/ramadan" style="display:block;margin-top:12px"><div class="spread"><strong>' + esc(t('ramadanMubarak')) + '</strong><span class="chip gold">' + esc(t('dayN', { n: ram.dayNum })) + '</span></div><div class="faint">' + esc(t('sehri') + ' ' + fmtTime(times.fajr) + ' · ' + t('iftar') + ' ' + fmtTime(times.maghrib)) + '</div></a>' : '') +
      err +
      '<h2 class="page-title" style="margin-top:18px">' + esc(t('todaysPrayers')) + '</h2>' +
      '<div class="prayer-grid">' + cards + '</div>' +
      '<div class="card" style="margin-top:12px">' + extras + '</div>' +
      '<div class="quick">' +
        qa('#/qibla', 'qibla', 'qibla') + qa('#/quran', 'quran', 'quran') +
        qa('#/tasbih', 'tasbih', 'tasbih') + qa('#/learn', 'learn', 'home') +
      '</div>' +
      '<div class="progress-row">' +
        '<div class="card mini-stat"><div class="spread"><span>' + esc(t('quranProgress')) + '</span><strong>' + esc(String(rec.quran || 0)) + '</strong></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + qPct + '%"></div></div>' +
        (last ? '<a class="faint" href="#/quran/' + last.surah + '/' + last.ayah + '">' + esc(t('continueReading')) + '</a>' : '') + '</div>' +
        '<div class="card mini-stat"><div class="spread"><span>' + esc(t('dhikrProgress')) + '</span><strong>' + esc(String(tas.todayTotal || 0)) + '</strong></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + dPct + '%"></div></div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><div class="faint">' + esc(t('dailyReminder')) + '</div><p>' + esc(rem) + '</p>' +
      '<div class="spread" style="margin-top:8px"><span class="faint">' + esc(t('streak')) + ': ' + esc(String(MoTracker.streak())) + ' ' + esc(t('days')) + '</span>' +
      '<span class="chip ok">' + esc(sc.pct + t('percent')) + '</span></div>' +
      '<p class="faint">' + esc(t('gentleNote')) + '</p></div>' +
      '<div class="install-banner" id="install-banner"><span>' + esc(t('installHint')) + '</span>' +
      '<button class="btn" id="btn-install">' + esc(t('installNow')) + '</button></div>';

    el.setAttribute('data-ready', '1');
    bindDashboard(el);
    maybeShowInstall();
  }

  function qa(href, key, ic) {
    return '<a href="' + href + '">' + icon(ic, 22) + '<span>' + esc(t(key)) + '</span></a>';
  }

  function bindDashboard(el) {
    el.querySelectorAll('[data-check]').forEach(function (b) {
      b.addEventListener('click', function () {
        MoTracker.togglePrayer(b.getAttribute('data-check'));
        el.setAttribute('data-ready', '0');
        renderDashboard();
      });
    });
    el.querySelectorAll('[data-bell]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = b.getAttribute('data-bell');
        settings.notifications = settings.notifications || {};
        settings.notifications[p] = settings.notifications[p] === false;
        saveSettings();
        el.setAttribute('data-ready', '0');
        renderDashboard();
      });
    });
    el.querySelectorAll('[data-open-loc]').forEach(function (b) {
      b.addEventListener('click', openLocationModal);
    });
  }

  /* ---------- location ---------- */
  function openLocationModal() {
    modal(
      '<h3>' + esc(t('location')) + '</h3>' +
      '<button class="btn block" id="m-gps">' + esc(t('useGps')) + '</button>' +
      '<div class="field" style="margin:12px 0"><label class="field">' + esc(t('searchCity')) +
      '<input class="input" id="m-city" placeholder="' + esc(t('cityPlaceholder')) + '"></label></div>' +
      '<div id="m-city-res" class="list"></div>' +
      '<hr class="sep"><div class="grid-2">' +
      '<label class="field">' + esc(t('latitude')) + '<input class="input" id="m-lat" inputmode="decimal" value="' + esc(geo.lat) + '"></label>' +
      '<label class="field">' + esc(t('longitude')) + '<input class="input" id="m-lng" inputmode="decimal" value="' + esc(geo.lng) + '"></label></div>' +
      '<button class="btn soft block" id="m-coords" style="margin-top:10px">' + esc(t('useCoords')) + '</button>' +
      '<button class="btn ghost block" id="m-close" style="margin-top:8px">' + esc(t('close')) + '</button>'
    );
    document.getElementById('m-close').onclick = closeModal;
    document.getElementById('m-gps').onclick = function () { tryGps(true); };
    document.getElementById('m-coords').onclick = function () {
      const lat = Number(document.getElementById('m-lat').value);
      const lng = Number(document.getElementById('m-lng').value);
      if (!isFinite(lat) || lat < -90 || lat > 90) return toast(t('invalidLat'));
      if (!isFinite(lng) || lng < -180 || lng > 180) return toast(t('invalidLng'));
      setGeo({ name: lat.toFixed(3) + ', ' + lng.toFixed(3), country: '', lat: lat, lng: lng, tz: undefined, source: 'manual' });
      closeModal();
    };
    const inp = document.getElementById('m-city');
    inp.addEventListener('input', U.debounce(function () { searchCities(inp.value); }, 220));
    searchCities('');
  }

  function searchCities(q) {
    q = String(q || '').trim().toLowerCase();
    const box = document.getElementById('m-city-res');
    if (!box) return;
    let list = (window.CITY_LIST || []);
    if (q) list = list.filter(function (c) {
      return c.name.toLowerCase().indexOf(q) !== -1 || (c.bn && c.bn.indexOf(q) !== -1) || (c.country && c.country.toLowerCase().indexOf(q) !== -1);
    });
    list = list.slice(0, 12);
    box.innerHTML = list.map(function (c) {
      return '<button class="list-item" type="button" data-city="' + esc(c.name) + '"><div class="num">📍</div><div><strong>' + esc(MoI18n.lang === 'bn' && c.bn ? c.bn : c.name) + '</strong><div class="faint">' + esc(c.country) + '</div></div></button>';
    }).join('') || '<div class="empty">' + esc(t('noCity')) + '</div>';
    box.querySelectorAll('[data-city]').forEach(function (b) {
      b.onclick = function () {
        const c = (window.CITY_LIST || []).find(function (x) { return x.name === b.getAttribute('data-city'); });
        if (c) { setGeo(Object.assign({}, c, { source: 'city' })); closeModal(); }
      };
    });
    if (q.length >= 3 && U.isOnline()) {
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q), {
        headers: { 'Accept': 'application/json' }
      }).then(function (r) { return r.json(); }).then(function (arr) {
        if (!document.getElementById('m-city-res') || document.getElementById('m-city').value.trim().toLowerCase() !== q) return;
        (arr || []).forEach(function (it) {
          const btn = document.createElement('button');
          btn.className = 'list-item';
          btn.type = 'button';
          btn.innerHTML = '<div class="num">🌐</div><div><strong>' + esc(it.display_name.split(',')[0]) + '</strong><div class="faint">' + esc(it.display_name) + '</div></div>';
          btn.onclick = function () {
            setGeo({ name: it.display_name.split(',')[0], country: it.display_name, lat: Number(it.lat), lng: Number(it.lon), source: 'search' });
            closeModal();
          };
          box.appendChild(btn);
        });
      }).catch(function () {});
    }
  }

  function setGeo(g) {
    geo = g;
    settings.location = g;
    settings.locationMode = g.source === 'gps' ? 'auto' : 'manual';
    saveSettings();
    toast(t('savedLocation') + ': ' + (g.name || ''));
    recompute();
  }

  function tryGps(user) {
    if (!navigator.geolocation) {
      toast(t('locUnavailable'));
      if (user) openLocationModal();
      return;
    }
    if (user) toast(t('locating'));
    navigator.geolocation.getCurrentPosition(function (pos) {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const near = (window.CITY_LIST || []).map(function (c) {
        return { c: c, d: U.haversineKm(lat, lng, c.lat, c.lng) };
      }).sort(function (a, b) { return a.d - b.d; })[0];
      const g = {
        name: near && near.d < 40 ? near.c.name : lat.toFixed(3) + ', ' + lng.toFixed(3),
        bn: near && near.d < 40 ? near.c.bn : '',
        country: near && near.d < 40 ? near.c.country : '',
        lat: lat, lng: lng, tz: near && near.d < 40 ? near.c.tz : undefined,
        source: 'gps'
      };
      setGeo(g);
    }, function (err) {
      if (err && err.code === 1) toast(t('locDenied'));
      else toast(t('locError'));
      MoStorage.set('geoDenied', true);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  /* ---------- quran ---------- */
  function renderQuran() {
    const el = document.getElementById('view-quran');
    const surahN = Number(route.parts[1]);
    if (surahN >= 1 && surahN <= 114) return renderReader(el, surahN, Number(route.parts[2]) || 0);
    const q = (el.querySelector('#quran-q') && el.querySelector('#quran-q').value) || '';
    const list = MoQuran.filterSurahs(q);
    const last = MoQuran.lastRead();
    el.innerHTML = '<h1 class="page-title">' + esc(t('quran')) + '</h1>' +
      (last ? '<a class="card list-item" href="#/quran/' + last.surah + '/' + last.ayah + '"><div class="num">📖</div><div><strong>' + esc(t('continueReading')) + '</strong><div class="faint">' + esc(t('surah') + ' ' + last.surah + ' · ' + t('ayah') + ' ' + last.ayah) + '</div></div></a>' : '') +
      '<div class="toolbar"><div class="searchbox">' + icon('search', 18) + '<input class="input" id="quran-q" placeholder="' + esc(t('searchQuran')) + '" value="' + esc(q) + '"></div></div>' +
      '<p class="faint">' + esc(t('quranSource')) + '</p>' +
      '<div class="list" id="surah-list">' + list.map(surahRow).join('') + '</div>';
    const inp = document.getElementById('quran-q');
    inp.addEventListener('input', U.debounce(function () {
      const rows = MoQuran.filterSurahs(inp.value).map(surahRow).join('');
      document.getElementById('surah-list').innerHTML = rows || '<div class="empty">' + esc(t('notFound')) + '</div>';
    }, 120));
  }

  function surahRow(s) {
    const name = MoI18n.lang === 'bn' ? s.bn : MoI18n.lang === 'ar' ? s.ar : s.en;
    const rev = s.r === 'Meccan' ? t('makki') : t('madani');
    return '<a class="list-item" href="#/quran/' + s.n + '"><div class="num">' + esc(U.localizeNumber(s.n, MoI18n.lang)) + '</div>' +
      '<div style="flex:1"><strong>' + esc(name) + '</strong> <span class="arabic" style="font-size:1.05rem">' + esc(s.ar) + '</span>' +
      '<div class="faint">' + esc(s.en) + ' · ' + esc(String(s.ayahs)) + ' ' + esc(t('ayahs')) + ' · ' + esc(rev) + '</div></div></a>';
  }

  async function renderReader(el, n, jump) {
    const meta = window.SURAH_LIST[n - 1];
    const name = meta ? (MoI18n.lang === 'bn' ? meta.bn : MoI18n.lang === 'ar' ? meta.ar : meta.en) : '';
    el.innerHTML = '<div class="reader-bar">' +
      '<a class="icon-btn" href="#/quran/' + Math.max(1, n - 1) + '" aria-label="' + esc(t('prev')) + '">‹</a>' +
      '<div style="flex:1;text-align:center"><strong>' + esc(n + '. ' + name) + '</strong><div class="arabic">' + esc(meta ? meta.ar : '') + '</div></div>' +
      '<a class="icon-btn" href="#/quran/' + Math.min(114, n + 1) + '" aria-label="' + esc(t('next')) + '">›</a></div>' +
      '<div class="toolbar">' +
      '<button class="btn ghost" id="font-minus" aria-label="' + esc(t('fontSize')) + '">A−</button>' +
      '<button class="btn ghost" id="font-plus">A+</button>' +
      '<button class="btn ghost" id="dark-read">' + esc(t('dark')) + '</button>' +
      '<select class="input" id="tr-pref" style="max-width:160px">' +
        '<option value="both"' + (settings.quran.translation === 'both' ? ' selected' : '') + '>' + esc(t('both')) + '</option>' +
        '<option value="bn"' + (settings.quran.translation === 'bn' ? ' selected' : '') + '>' + esc(t('bengali')) + '</option>' +
        '<option value="en"' + (settings.quran.translation === 'en' ? ' selected' : '') + '>' + esc(t('english')) + '</option>' +
        '<option value="ar"' + (settings.quran.translation === 'ar' ? ' selected' : '') + '>' + esc(t('arabic')) + '</option>' +
      '</select></div>' +
      '<div class="card" id="ayahs"><div class="empty">' + esc(t('loadingQuran')) + '</div></div>';

    document.getElementById('font-minus').onclick = function () { settings.quran.arabicSize = Math.max(18, (settings.quran.arabicSize || 28) - 2); saveSettings(); applyLang(); renderQuran(); };
    document.getElementById('font-plus').onclick = function () { settings.quran.arabicSize = Math.min(48, (settings.quran.arabicSize || 28) + 2); saveSettings(); applyLang(); renderQuran(); };
    document.getElementById('tr-pref').onchange = function () { settings.quran.translation = this.value; saveSettings(); renderQuran(); };
    document.getElementById('dark-read').onclick = function () { document.getElementById('ayahs').classList.toggle('dark-read'); };

    try {
      const pack = await MoQuran.getSurah(n);
      if (route.parts[1] !== String(n)) return;
      const pref = settings.quran.translation || 'both';
      const box = document.getElementById('ayahs');
      box.innerHTML = pack.ayahs.map(function (a) {
        const bm = isBm('ayah', n + ':' + a.n);
        let tr = '';
        if (pref === 'both' || pref === 'bn') tr += '<div class="ayah-tr bn">' + esc(a.bn) + '</div>';
        if (pref === 'both' || pref === 'en') tr += '<div class="ayah-tr en">' + esc(a.en) + '</div>';
        return '<article class="ayah" id="a-' + a.n + '"><div class="ayah-meta">' +
          '<span class="ayah-no">' + esc(String(a.n)) + '</span>' +
          '<div class="ayah-actions">' +
          '<button class="icon-btn" data-play="' + a.n + '" aria-label="' + esc(t('play')) + '">▶</button>' +
          '<button class="icon-btn' + (bm ? ' active' : '') + '" data-bm="' + a.n + '" aria-label="' + esc(t('bookmarkAyah')) + '">★</button>' +
          '<button class="icon-btn" data-copy="' + a.n + '" aria-label="' + esc(t('copy')) + '">⧉</button>' +
          '</div></div>' +
          '<div class="ayah-ar arabic">' + esc(a.ar) + '</div>' + tr + '</article>';
      }).join('');
      box.querySelectorAll('[data-play]').forEach(function (b) {
        b.onclick = function () {
          const an = Number(b.getAttribute('data-play'));
          const ayah = pack.ayahs[an - 1];
          if (MoQuran.isPlaying(n, an)) { MoQuran.stopAudio(); b.textContent = '▶'; return; }
          function onAud(ev, cur) {
            if (ev === 'ended' && cur) {
              const nxt = pack.ayahs[cur.ayah];
              if (nxt) MoQuran.playAyah(n, nxt, onAud);
            }
            if (ev === 'error') toast(t('audioUnavailable'));
          }
          MoQuran.playAyah(n, ayah, onAud).catch(function () { toast(t('audioUnavailable')); });
        };
      });
      box.querySelectorAll('[data-bm]').forEach(function (b) {
        b.onclick = function () {
          const an = Number(b.getAttribute('data-bm'));
          const ayah = pack.ayahs[an - 1];
          const on = toggleBm({ type: 'ayah', id: n + ':' + an, title: pack.en + ' ' + n + ':' + an, sub: ayah.ar, href: '#/quran/' + n + '/' + an });
          b.classList.toggle('active', on);
        };
      });
      box.querySelectorAll('[data-copy]').forEach(function (b) {
        b.onclick = function () {
          const an = Number(b.getAttribute('data-copy'));
          const ayah = pack.ayahs[an - 1];
          U.copyText(ayah.ar + '\n' + ayah.bn + '\n' + ayah.en + '\n(' + n + ':' + an + ')').then(function () { toast(t('copied')); });
        };
      });
      MoQuran.lastRead({ surah: n, ayah: jump || 1, name: pack.en });
      MoTracker.addQuran(0);
      if (jump) {
        const node = document.getElementById('a-' + jump);
        if (node) node.scrollIntoView({ block: 'center' });
      }
    } catch (e) {
      const box = document.getElementById('ayahs');
      if (!box) return;
      const msg = (e && e.code === 'offline') ? t('quranOffline') : t('networkError');
      box.innerHTML = '<div class="error-box">' + esc(msg) + '</div>';
    }
  }

  /* ---------- qibla ---------- */
  function renderQibla() {
    const el = document.getElementById('view-qibla');
    const q = MoQibla.qiblaOf(geo);
    const dist = MoQibla.distanceOf(geo);
    const has = MoQibla.hasSensorHint();
    const qDeg = q != null ? Math.round(q) : null;
    el.innerHTML = '<h1 class="page-title">' + esc(t('qibla')) + '</h1>' +
      '<p class="muted">' + esc(locLabel()) + '</p>' +
      '<div class="compass-wrap">' +
      '<div class="compass" id="compass" dir="ltr" aria-label="' + esc(t('qibla')) + '">' +
      '<div class="compass-notch" title="' + esc(t('facing')) + '"></div>' +
      '<div class="compass-rose" id="compass-rose">' +
      '<div class="compass-cardinals"><span class="c-n">N</span><span class="c-e">E</span><span class="c-s">S</span><span class="c-w">W</span></div>' +
      '<div class="qibla-arm" id="qibla-arm"><div class="kaaba-dot" id="kaaba" title="Kaaba"></div></div>' +
      '</div>' +
      '<div class="compass-center"></div></div>' +
      '<div class="card" style="width:100%">' +
      '<div class="spread"><span>' + esc(t('qiblaAngle')) + '</span><strong class="ltr-keep">' + esc(qDeg != null ? qDeg + '°' : '—') + '</strong></div>' +
      '<div class="faint">' + esc(t('fromNorth')) + '</div>' +
      '<div class="spread" style="margin-top:8px"><span>' + esc(t('yourHeading')) + '</span><strong id="head-lab">—</strong></div>' +
      '<div class="spread"><span>' + esc(t('qiblaDistance')) + '</span><span>' + esc(dist != null ? Math.round(dist) + ' ' + t('km') : '—') + '</span></div>' +
      '<p id="qibla-status" class="faint" style="margin-top:8px"></p>' +
      (has ? '<button class="btn block" id="en-compass" type="button">' + esc(t('enableCompass')) + '</button>' : '') +
      '<p class="faint">' + esc(t('compassCalibrate')) + '</p>' +
      '</div></div>';
    const arm = document.getElementById('qibla-arm');
    if (arm && q != null) arm.style.transform = 'rotate(' + q + 'deg)';
    const rose = document.getElementById('compass-rose');
    if (rose) rose.style.transform = 'rotate(0deg)';
    const status = document.getElementById('qibla-status');
    if (!has) status.textContent = t('noCompass');
    else status.textContent = t('permissionCompass');
    const btn = document.getElementById('en-compass');
    if (btn) btn.onclick = function () {
      MoQibla.enableCompass().then(function (r) {
        if (!r.ok) { toast(t('noCompass')); status.textContent = t('noCompass'); }
        else { status.textContent = t('compassCalibrate'); btn.hidden = true; }
      });
    };
    if (has && !MoQibla.needsPermission()) {
      MoQibla.start();
      if (btn) btn.hidden = true;
    }
  }

  function updateQiblaUI(heading) {
    qiblaHeading = heading;
    const q = MoQibla.qiblaOf(geo);
    const rose = document.getElementById('compass-rose');
    const compass = document.getElementById('compass');
    const lab = document.getElementById('head-lab');
    const status = document.getElementById('qibla-status');
    if (lab) lab.textContent = Math.round(heading) + '°';
    if (rose) rose.style.transform = 'rotate(' + (-heading) + 'deg)';
    if (q != null) {
      let diff = U.fixAngle(q - heading);
      if (diff > 180) diff -= 360;
      const aligned = Math.abs(diff) < 8;
      if (compass) compass.classList.toggle('aligned', aligned);
      if (status) {
        if (aligned) status.textContent = t('facingQibla');
        else status.textContent = diff > 0 ? t('turnRight') : t('turnLeft');
      }
    }
  }

  /* ---------- tasbih ---------- */
  function renderTasbih() {
    const el = document.getElementById('view-tasbih');
    const s = MoTasbih.load();
    const p = MoTasbih.PRESETS.find(function (x) { return x.id === s.preset; });
    const label = s.preset === 'custom' ? (s.custom || t('custom')) : t(s.preset);
    const ar = s.preset === 'custom' ? (s.custom || '') : (p ? p.ar : '');
    const pct = s.target ? Math.min(1, s.count / s.target) : 0;
    const C = 2 * Math.PI * 54;
    const dash = C * (1 - pct);
    el.innerHTML = '<h1 class="page-title">' + esc(t('tasbih')) + '</h1>' +
      '<div class="cats" id="dhikr-presets">' +
      MoTasbih.PRESETS.map(function (x) {
        return '<button type="button" class="' + (s.preset === x.id ? 'on' : '') + '" data-pre="' + x.id + '">' + esc(t(x.id)) + '</button>';
      }).join('') +
      '<button type="button" class="' + (s.preset === 'custom' ? 'on' : '') + '" data-pre="custom">' + esc(t('custom')) + '</button></div>' +
      '<p class="arabic" style="text-align:center;font-size:1.6rem">' + esc(ar) + '</p>' +
      '<p style="text-align:center">' + esc(label) + '</p>' +
      '<div class="ring-wrap"><svg width="220" height="220" viewBox="0 0 120 120">' +
      '<circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-2)" stroke-width="8"/>' +
      '<circle cx="60" cy="60" r="54" fill="none" stroke="var(--primary)" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + dash.toFixed(1) + '"/></svg>' +
      '<div class="ring-label"><strong>' + esc(String(s.count)) + '</strong><span class="faint">' + esc(t('of') + ' ' + s.target) + '</span></div></div>' +
      '<button class="tap-area" id="tap-dhikr" type="button">' + esc(t('plusOne')) + '</button>' +
      '<div class="spread" style="margin:12px 0"><span>' + esc(t('rounds')) + ': ' + esc(String(s.rounds)) + '</span><span>' + esc(t('todayCount')) + ': ' + esc(String(s.todayTotal)) + '</span></div>' +
      '<div class="grid-3">' + [33, 100, 500].map(function (n) {
        return '<button class="btn ghost" data-tg="' + n + '">' + n + '</button>';
      }).join('') + '</div>' +
      '<label class="field" style="margin-top:10px">' + esc(t('customTarget')) + '<input class="input" id="tg-custom" type="number" min="1" max="10000" value="' + esc(s.target) + '"></label>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost" id="reset-dhikr">' + esc(t('reset')) + '</button>' +
      '<label class="row faint"><input type="checkbox" id="vib-dhikr"' + (s.vibrate !== false ? ' checked' : '') + '> ' + esc(t('vibrationOnTap')) + '</label></div>';
    document.getElementById('tap-dhikr').onclick = function () { MoTasbih.tap(); renderTasbih(); };
    document.getElementById('reset-dhikr').onclick = function () {
      if (confirm(t('confirmReset'))) { MoTasbih.resetCounter(); renderTasbih(); }
    };
    document.getElementById('tg-custom').onchange = function () { MoTasbih.setTarget(this.value); renderTasbih(); };
    document.getElementById('vib-dhikr').onchange = function () { const st = MoTasbih.load(); st.vibrate = this.checked; MoTasbih.save(st); };
    el.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { MoTasbih.setTarget(b.getAttribute('data-tg')); renderTasbih(); }; });
    el.querySelectorAll('[data-pre]').forEach(function (b) {
      b.onclick = function () {
        const id = b.getAttribute('data-pre');
        if (id === 'custom') {
          const txt = prompt(t('dhikrText'), MoTasbih.load().custom || '');
          if (txt) MoTasbih.setCustom(txt);
        } else MoTasbih.setPreset(id);
        renderTasbih();
      };
    });
  }

  /* ---------- hadith / dua ---------- */
  function renderHadith() {
    const el = document.getElementById('view-hadith');
    const cats = ['all', 'salah', 'faith', 'character', 'dua', 'fasting', 'knowledge', 'family', 'charity'];
    const cat = route.parts[1] && window.HADITH_DATA.some(function (h) { return h.id === route.parts[1]; }) ? 'all' : (route.parts[1] || 'all');
    const focus = window.HADITH_DATA.find(function (h) { return h.id === route.parts[1]; });
    const list = focus ? [focus] : window.HADITH_DATA.filter(function (h) { return cat === 'all' || h.cat === cat; });
    const catKey = { salah: 'salahCat', faith: 'faith', character: 'character', dua: 'dua', fasting: 'fastingCat', knowledge: 'knowledge', family: 'family', charity: 'charity', all: 'all' };
    el.innerHTML = '<h1 class="page-title">' + esc(t('hadith')) + '</h1>' +
      '<div class="cats">' + cats.map(function (c) {
        return '<a class="' + (c === cat && !focus ? 'on' : '') + '" href="#/hadith' + (c === 'all' ? '' : '/' + c) + '" style="padding:6px 12px;border:1px solid var(--line);border-radius:99px;background:' + (c === cat && !focus ? 'var(--primary);color:var(--primary-ink)' : 'var(--surface)') + '">' + esc(t(catKey[c])) + '</a>';
      }).join('') + '</div>' +
      (list.length ? list.map(function (h) {
        const text = MoI18n.lang === 'bn' ? h.bn : MoI18n.lang === 'ar' ? h.ar : h.en;
        const bm = isBm('hadith', h.id);
        return '<article class="card hadith" id="' + h.id + '"><div class="ref">' + esc(h.collection + ' ' + h.ref + (h.also ? ' · ' + h.also : '')) + '</div>' +
          '<div class="arabic">' + esc(h.ar) + '</div>' +
          '<p>' + esc(text) + '</p>' +
          (MoI18n.lang !== 'en' ? '<p class="faint">' + esc(h.en) + '</p>' : '') +
          '<div class="row"><button class="btn ghost" data-copyh="' + h.id + '">' + esc(t('copy')) + '</button>' +
          '<button class="btn ghost" data-shareh="' + h.id + '">' + esc(t('share')) + '</button>' +
          '<button class="btn ghost' + (bm ? ' gold' : '') + '" data-bmh="' + h.id + '">★</button></div></article>';
      }).join('') : '<div class="empty">' + esc(t('noHadith')) + '</div>');
    bindShareCopy(el, 'hadith');
  }

  function renderDua() {
    const el = document.getElementById('view-dua');
    const cats = ['all', 'morning', 'evening', 'sleeping', 'waking', 'beforeEating', 'afterEating', 'enterMosque', 'leaveMosque', 'studying', 'travel', 'protection', 'forgiveness', 'anxiety', 'afterSalah', 'afterWudu', 'adhan', 'home', 'clothes', 'toilet', 'illness', 'rain'];
    const focus = window.DUA_DATA.find(function (d) { return d.id === route.parts[1]; });
    const cat = focus ? focus.cat : (route.parts[1] || 'all');
    const list = focus ? [focus] : window.DUA_DATA.filter(function (d) { return cat === 'all' || d.cat === cat; });
    el.innerHTML = '<h1 class="page-title">' + esc(t('dua')) + '</h1>' +
      '<div class="spread"><label class="field" style="flex:1">' + esc(t('fontSize')) +
      '<input type="range" id="dua-font" min="16" max="36" value="' + (settings.duaFont || 22) + '"></label></div>' +
      '<div class="cats">' + cats.map(function (c) {
        return '<a href="#/dua/' + c + '" class="chip' + (c === cat ? ' gold' : '') + '">' + esc(t(c)) + '</a>';
      }).join('') + '</div>' +
      (list.length ? list.map(function (d) {
        const title = d.title[MoI18n.lang] || d.title.en;
        const bm = isBm('dua', d.id);
        return '<article class="card dua-card" id="' + d.id + '"><h3>' + esc(title) + '</h3>' +
          '<div class="arabic" style="font-size:' + (settings.duaFont || 22) + 'px">' + esc(d.ar) + '</div>' +
          '<p class="faint">' + esc(t('pronunciation')) + ': ' + esc(d.pronBn) + '</p>' +
          '<p>' + esc(MoI18n.lang === 'en' ? d.en : d.bn) + '</p>' +
          (MoI18n.lang !== 'en' ? '<p class="faint">' + esc(d.en) + '</p>' : '') +
          '<div class="ref">' + esc(t('reference') + ': ' + d.ref) + '</div>' +
          '<div class="row" style="margin-top:8px"><button class="btn ghost" data-copyd="' + d.id + '">' + esc(t('copy')) + '</button>' +
          '<button class="btn ghost" data-shared="' + d.id + '">' + esc(t('share')) + '</button>' +
          '<button class="btn ghost" data-bmd="' + d.id + '">' + (bm ? '★' : '☆') + '</button></div></article>';
      }).join('') : '<div class="empty">' + esc(t('noDua')) + '</div>');
    const range = document.getElementById('dua-font');
    if (range) range.oninput = function () {
      settings.duaFont = Number(this.value);
      saveSettings();
      el.querySelectorAll('.dua-card .arabic').forEach(function (n) { n.style.fontSize = settings.duaFont + 'px'; });
    };
    bindShareCopy(el, 'dua');
  }

  function bindShareCopy(el, kind) {
    el.querySelectorAll('[data-copyh],[data-copyd]').forEach(function (b) {
      b.onclick = function () {
        const id = b.getAttribute('data-copyh') || b.getAttribute('data-copyd');
        const item = kind === 'hadith' ? window.HADITH_DATA.find(function (x) { return x.id === id; }) : window.DUA_DATA.find(function (x) { return x.id === id; });
        if (!item) return;
        U.copyText(item.ar + '\n' + item.bn + '\n' + item.en + '\n' + (item.collection ? item.collection + ' ' + item.ref : item.ref)).then(function () { toast(t('copied')); });
      };
    });
    el.querySelectorAll('[data-shareh],[data-shared]').forEach(function (b) {
      b.onclick = function () {
        const id = b.getAttribute('data-shareh') || b.getAttribute('data-shared');
        const item = kind === 'hadith' ? window.HADITH_DATA.find(function (x) { return x.id === id; }) : window.DUA_DATA.find(function (x) { return x.id === id; });
        if (!item) return;
        U.shareText(t('appName'), item.ar + '\n' + item.en + '\n' + (item.ref || '')).then(function (r) { if (r === 'copied') toast(t('copied')); });
      };
    });
    el.querySelectorAll('[data-bmh],[data-bmd]').forEach(function (b) {
      b.onclick = function () {
        const id = b.getAttribute('data-bmh') || b.getAttribute('data-bmd');
        const item = kind === 'hadith' ? window.HADITH_DATA.find(function (x) { return x.id === id; }) : window.DUA_DATA.find(function (x) { return x.id === id; });
        toggleBm({ type: kind, id: id, title: item.en.slice(0, 80), sub: item.ref || item.collection, href: '#/' + kind + '/' + id });
        if (kind === 'hadith') renderHadith(); else renderDua();
      };
    });
  }

  /* ---------- learn ---------- */
  function renderLearn() {
    const el = document.getElementById('view-learn');
    const sub = route.parts[1] || '';
    const N = window.NAMAZ_DATA;
    if (!sub) {
      el.innerHTML = '<h1 class="page-title">' + esc(t('learnSalah')) + '</h1>' +
        '<p class="note-box">' + esc(t('madhhabNote')) + '</p>' +
        '<div class="more-grid" style="margin-top:12px">' +
        [['wudu', t('wudu')], ['fajr', t('fajr')], ['dhuhr', t('dhuhr')], ['asr', t('asr')], ['maghrib', t('maghrib')], ['isha', t('isha')], ['witr', t('witr')], ['sunnah', t('sunnah')], ['nafl', t('nafl')], ['mistakes', t('commonMistakesTitle')], ['recitations', t('recitationsTitle')]]
          .map(function (x) { return '<a href="#/learn/' + x[0] + '"><strong>' + esc(x[1]) + '</strong></a>'; }).join('') +
        '</div>';
      return;
    }
    if (sub === 'wudu') {
      el.innerHTML = '<a href="#/learn">' + esc(t('back')) + '</a><h1 class="page-title">' + esc(t('wuduTitle')) + '</h1>' +
        '<p>' + esc(N.wudu.intro[MoI18n.lang] || N.wudu.intro.en) + '</p>' +
        '<p class="note-box">' + esc(N.wudu.fard[MoI18n.lang] || N.wudu.fard.en) + '</p>' +
        '<div class="stepper">' + N.wudu.steps.map(function (s, i) {
          return '<div class="step"><div class="n">' + (i + 1) + '</div><div><div class="arabic">' + esc(s.ar) + '</div>' +
            '<div class="faint">' + esc(s.pronBn) + '</div><p>' + esc(MoI18n.lang === 'en' ? s.en : s.bn) + '</p></div></div>';
        }).join('') + '</div>';
      return;
    }
    if (sub === 'recitations') {
      el.innerHTML = '<a href="#/learn">' + esc(t('back')) + '</a><h1 class="page-title">' + esc(t('recitationsTitle')) + '</h1>' +
        N.recitations.map(function (r) {
          const title = r.title[MoI18n.lang] || r.title.en;
          const bm = isBm('lesson', r.id);
          return '<article class="card"><h3>' + esc(title) + '</h3><div class="arabic" style="font-size:1.3rem">' + esc(r.ar) + '</div>' +
            '<p class="faint">' + esc(r.pronBn) + '</p><p>' + esc(MoI18n.lang === 'en' ? r.en : r.bn) + '</p>' +
            '<button class="btn ghost" data-ls="' + r.id + '">' + (bm ? '★' : '☆') + '</button></article>';
        }).join('');
      el.querySelectorAll('[data-ls]').forEach(function (b) {
        b.onclick = function () {
          const r = N.recitations.find(function (x) { return x.id === b.getAttribute('data-ls'); });
          toggleBm({ type: 'lesson', id: r.id, title: r.title.en, href: '#/learn/recitations' });
          renderLearn();
        };
      });
      return;
    }
    if (sub === 'mistakes') {
      el.innerHTML = '<a href="#/learn">' + esc(t('back')) + '</a><h1 class="page-title">' + esc(t('commonMistakesTitle')) + '</h1>' +
        '<div class="stepper">' + N.mistakes.map(function (m, i) {
          return '<div class="step"><div class="n">' + (i + 1) + '</div><p>' + esc(MoI18n.lang === 'en' ? m.en : m.bn) + '</p></div>';
        }).join('') + '</div>';
      return;
    }
    if (sub === 'witr' || sub === 'sunnah' || sub === 'nafl') {
      const body = sub === 'witr' ? N.witr : N.sunnahNafl;
      el.innerHTML = '<a href="#/learn">' + esc(t('back')) + '</a><h1 class="page-title">' + esc(t(sub === 'witr' ? 'witr' : sub)) + '</h1>' +
        '<p class="note-box">' + esc(t('vitirNote')) + '</p><p>' + esc(body[MoI18n.lang] || body.en) + '</p>';
      return;
    }
    const pr = N.prayers[sub];
    if (pr) {
      const rk = pr.rakah;
      let rkHtml = Object.keys(rk).map(function (k) { return '<div class="chip">' + esc(k) + ': ' + rk[k] + '</div>'; }).join(' ');
      el.innerHTML = '<a href="#/learn">' + esc(t('back')) + '</a><h1 class="page-title">' + esc(t(sub)) + '</h1>' +
        '<p>' + esc(pr[MoI18n.lang] || pr.en) + '</p><div class="row" style="flex-wrap:wrap;margin:8px 0">' + rkHtml + '</div>' +
        '<p class="note-box">' + esc(t('madhhabNote')) + '</p>' +
        '<h3>' + esc(t('step')) + '</h3><div class="stepper">' + N.genericSteps.map(function (s, i) {
          return '<div class="step"><div class="n">' + (i + 1) + '</div><p>' + esc(MoI18n.lang === 'en' ? s.en : s.bn) + '</p></div>';
        }).join('') + '</div>' +
        '<p><a href="#/learn/recitations">' + esc(t('recitationsTitle')) + '</a></p>';
      return;
    }
    navigate('#/learn');
  }

  /* ---------- tracker ---------- */
  function renderTracker() {
    const el = document.getElementById('view-tracker');
    const rec = MoTracker.today().rec;
    const sc = MoTracker.score(rec);
    const week = MoTracker.week();
    const month = MoTracker.month();
    const mPct = Math.round(month.reduce(function (a, x) { return a + x.score.pct; }, 0) / month.length);
    el.innerHTML = '<h1 class="page-title">' + esc(t('tracker')) + '</h1>' +
      '<p class="faint">' + esc(t('gentleNote')) + '</p>' +
      '<div class="card"><div class="spread"><strong>' + esc(t('today')) + '</strong><span class="chip ok">' + sc.pct + '%</span></div>' +
      '<div class="faint">' + esc(t('streak') + ': ' + MoTracker.streak() + ' ' + t('days')) + '</div>' +
      PRAYERS.map(function (p) {
        return '<div class="toggle"><span>' + esc(t(p)) + '</span><button class="check' + (rec[p] ? ' on' : '') + '" data-tp="' + p + '">' + (rec[p] ? '✓' : '') + '</button></div>';
      }).join('') +
      '<div class="toggle"><span>' + esc(t('quran')) + ' (' + (rec.quran || 0) + ')</span><button class="btn ghost" data-aq>+1</button></div>' +
      '<div class="toggle"><span>' + esc(t('tasbih')) + ' (' + (rec.dhikr || 0) + ')</span><span class="faint">' + esc(t('tasbih')) + '</span></div>' +
      '<div class="toggle"><span>' + esc(t('dua')) + '</span><button class="check' + (rec.dua ? ' on' : '') + '" data-td>' + (rec.dua ? '✓' : '') + '</button></div>' +
      '</div>' +
      '<div class="card"><h3>' + esc(t('weekly')) + '</h3><div class="week-bars">' +
      week.map(function (d) {
        const lab = t('weekDaysShort')[new Date(d.date + 'T12:00:00').getDay()];
        return '<div class="col"><span style="height:' + Math.max(8, d.score.pct) + '%"></span><small>' + esc(lab) + '</small></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><div class="spread"><span>' + esc(t('monthly')) + '</span><strong>' + mPct + '%</strong></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + mPct + '%"></div></div>' +
      '<p class="faint">' + esc(t('keepGoing')) + '</p></div>';
    el.querySelectorAll('[data-tp]').forEach(function (b) {
      b.onclick = function () { MoTracker.togglePrayer(b.getAttribute('data-tp')); renderTracker(); };
    });
    el.querySelector('[data-aq]').onclick = function () { MoTracker.addQuran(1); renderTracker(); };
    el.querySelector('[data-td]').onclick = function () { MoTracker.toggleDua(); renderTracker(); };
  }

  /* ---------- calendar ---------- */
  function renderCalendar() {
    const el = document.getElementById('view-calendar');
    const now = new Date();
    const h = U.gregorianToHijri(now);
    const hy = Number(el.getAttribute('data-hy')) || h.year;
    const hm = Number(el.getAttribute('data-hm')) || h.month;
    const grid = MoCalendar.monthGrid(hy, hm);
    const months = MoI18n.lang === 'bn' ? U.HIJRI_MONTHS_BN : MoI18n.lang === 'ar' ? U.HIJRI_MONTHS_AR : U.HIJRI_MONTHS_EN;
    const wd = t('weekDaysShort');
    let cells = wd.map(function (x) { return '<div class="hd">' + esc(x) + '</div>'; }).join('');
    grid.cells.forEach(function (c) {
      if (!c) { cells += '<div></div>'; return; }
      const today = c.h === h.day && hm === h.month && hy === h.year;
      cells += '<div class="cal-cell' + (today ? ' today' : '') + (c.events.length ? ' event' : '') + '"><strong>' + c.h + '</strong><span class="g">' + c.g.getDate() + '</span></div>';
    });
    const events = MoCalendar.eventsInYear(hy);
    el.setAttribute('data-hy', hy); el.setAttribute('data-hm', hm);
    el.innerHTML = '<h1 class="page-title">' + esc(t('calendar')) + '</h1>' +
      '<p class="note-box">' + esc(t('hijriNote')) + '</p>' +
      '<div class="spread"><button class="icon-btn" id="cal-prev">‹</button><strong>' + esc(months[hm - 1] + ' ' + hy) + '</strong><button class="icon-btn" id="cal-next">›</button></div>' +
      '<div class="cal-grid" style="margin-top:10px">' + cells + '</div>' +
      '<h3 style="margin-top:16px">' + esc(t('importantDates')) + '</h3>' +
      events.map(function (e) {
        const title = e[MoI18n.lang] || e.en;
        return '<div class="list-item"><div class="num">' + e.day + '</div><div><strong>' + esc(title) + '</strong><div class="faint">' + esc(months[e.month - 1]) + ' · ' + esc(e.g.toDateString()) + '</div></div></div>';
      }).join('') +
      '<h3 style="margin-top:16px">' + esc(t('convertDate')) + '</h3>' +
      '<label class="field">' + esc(t('gregorian')) + '<input class="input" type="date" id="g-in"></label>' +
      '<p id="g-out" class="card" style="margin-top:8px"></p>';
    document.getElementById('cal-prev').onclick = function () {
      let m = hm - 1, y = hy; if (m < 1) { m = 12; y--; }
      el.setAttribute('data-hy', y); el.setAttribute('data-hm', m); renderCalendar();
    };
    document.getElementById('cal-next').onclick = function () {
      let m = hm + 1, y = hy; if (m > 12) { m = 1; y++; }
      el.setAttribute('data-hy', y); el.setAttribute('data-hm', m); renderCalendar();
    };
    document.getElementById('g-in').onchange = function () {
      const d = new Date(this.value + 'T12:00:00');
      if (isNaN(d)) { document.getElementById('g-out').textContent = t('invalidDate'); return; }
      document.getElementById('g-out').textContent = U.formatHijri(U.gregorianToHijri(d), MoI18n.lang);
    };
  }

  /* ---------- zakat ---------- */
  function renderZakat() {
    const el = document.getElementById('view-zakat');
    const saved = MoStorage.get('zakatForm', { nisab: 'gold', goldPrice: '', silverPrice: '', goldGrams: '', silverGrams: '', cash: '', bank: '', invest: '', business: '', debts: '' });
    el.innerHTML = '<h1 class="page-title">' + esc(t('zakat')) + '</h1>' +
      '<p class="note-box">' + esc(t('zakatDisclaimer')) + '</p>' +
      '<div class="seg" id="nisab-seg"><button type="button" data-n="gold" class="' + (saved.nisab !== 'silver' ? 'on' : '') + '">' + esc(t('useGoldNisab')) + '</button>' +
      '<button type="button" data-n="silver" class="' + (saved.nisab === 'silver' ? 'on' : '') + '">' + esc(t('useSilverNisab')) + '</button></div>' +
      '<form id="z-form" class="stack" style="margin-top:12px">' +
      field('goldPrice', t('goldPrice'), saved.goldPrice) +
      field('silverPrice', t('silverPrice'), saved.silverPrice) +
      field('goldGrams', t('goldUnit'), saved.goldGrams) +
      field('silverGrams', t('silverUnit'), saved.silverGrams) +
      field('cash', t('cash'), saved.cash) +
      field('bank', t('bank'), saved.bank) +
      field('invest', t('investments'), saved.invest) +
      field('business', t('business'), saved.business) +
      field('debts', t('debts'), saved.debts) +
      '<button class="btn" type="submit">' + esc(t('calculate')) + '</button></form>' +
      '<div id="z-out"></div>';
    function field(id, lab, val) {
      return '<label class="field">' + esc(lab) + '<input class="input" id="z-' + id + '" inputmode="decimal" value="' + esc(val || '') + '"></label>';
    }
    let nisab = saved.nisab || 'gold';
    el.querySelectorAll('#nisab-seg button').forEach(function (b) {
      b.onclick = function () {
        nisab = b.getAttribute('data-n');
        el.querySelectorAll('#nisab-seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      };
    });
    document.getElementById('z-form').onsubmit = function (e) {
      e.preventDefault();
      const input = { nisab: nisab };
      ['goldPrice', 'silverPrice', 'goldGrams', 'silverGrams', 'cash', 'bank', 'invest', 'business', 'debts'].forEach(function (k) {
        input[k] = document.getElementById('z-' + k).value;
      });
      MoStorage.set('zakatForm', input);
      const r = MoZakat.compute(input);
      const lang = MoI18n.lang;
      document.getElementById('z-out').innerHTML =
        '<div class="card"><div class="spread"><span>' + esc(t('eligible')) + '</span><strong>' + esc(MoZakat.fmt(r.eligible, lang)) + '</strong></div>' +
        '<div class="spread"><span>' + esc(t('nisab')) + '</span><span>' + esc(MoZakat.fmt(r.nisabVal, lang)) + '</span></div>' +
        (r.above
          ? '<div class="spread"><span>' + esc(t('zakatDue')) + '</span><strong>' + esc(MoZakat.fmt(r.zakat, lang)) + '</strong></div>'
          : '<p class="note-box">' + esc(t('belowNisab')) + '</p>') +
        '<p class="faint">' + esc(t('nisabGold') + ' · ' + t('nisabSilver')) + '</p></div>';
    };
  }

  /* ---------- ramadan ---------- */
  function renderRamadan() {
    const el = document.getElementById('view-ramadan');
    const now = new Date();
    const ram = MoCalendar.ramadanInfo(now);
    const times = prayerRes && prayerRes.times;
    const rec = MoTracker.today().rec;
    const all = MoTracker.loadAll();
    let fasts = 0;
    Object.keys(all).forEach(function (k) { if (all[k].fast) fasts++; });
    let cd = '';
    if (times) {
      const hours = PrayerEngine.hoursNow(now);
      if (hours < times.fajr) cd = t('sehri') + ': ' + U.formatDuration(U.hoursToDate(now, times.fajr) - now);
      else if (hours < times.maghrib) cd = t('iftar') + ': ' + U.formatDuration(U.hoursToDate(now, times.maghrib) - now);
      else cd = t('sehri') + ' · ' + t('tomorrow') + ' ' + fmtTime(times.fajr);
    }
    el.innerHTML = '<h1 class="page-title">' + esc(t('ramadan')) + '</h1>' +
      (ram.isRamadan
        ? '<div class="card hero"><div class="badge-ramadan">' + esc(t('ramadanMubarak')) + '</div>' +
          '<div class="next-name">' + esc(t('dayN', { n: ram.dayNum })) + '</div>' +
          '<div>' + esc(t('remainingN', { n: ram.remaining })) + '</div></div>'
        : '<div class="note-box">' + esc(t('notRamadan')) + '</div>') +
      '<div class="grid-2" style="margin-top:12px">' +
      '<div class="card"><div class="faint">' + esc(t('suhoorEnds')) + '</div><strong class="ltr-keep">' + esc(fmtTime(times && times.fajr)) + '</strong></div>' +
      '<div class="card"><div class="faint">' + esc(t('iftarAt')) + '</div><strong class="ltr-keep">' + esc(fmtTime(times && times.maghrib)) + '</strong></div></div>' +
      '<p class="card" style="margin-top:10px">' + esc(cd) + '</p>' +
      '<div class="card"><div class="arabic" style="font-size:1.2rem;text-align:center">اللَّهُمَّ إِنِّي لَكَ صُمْتُ وَبِكَ آمَنْتُ وَعَلَيْكَ تَوَكَّلْتُ وَعَلَىٰ رِزْقِكَ أَفْطَرْتُ</div>' +
      '<p>' + esc(t('ramadanDua')) + '</p><p class="faint">' + esc(t('ramadanDuaEn')) + '</p>' +
      '<p class="faint">' + esc(t('source')) + ': Abu Dawud 2358 — some scholars grade the chain as weak; the meaning is a well-known iftar remembrance. Allah knows best.</p></div>' +
      '<div class="toggle card"><span>' + esc(t('fastKept')) + '</span><button class="check' + (rec.fast ? ' on' : '') + '" id="fast-btn">' + (rec.fast ? '✓' : '') + '</button></div>' +
      '<p class="faint">' + esc(t('fastsThisMonth')) + ': ' + fasts + '</p>' +
      '<p class="note-box">' + esc(t('hijriNote')) + '</p>';
    document.getElementById('fast-btn').onclick = function () { MoTracker.toggleFast(); renderRamadan(); };
  }

  /* ---------- bookmarks / search / more / about / settings ---------- */
  function renderBookmarks() {
    const el = document.getElementById('view-bookmarks');
    const list = bookmarks();
    el.innerHTML = '<h1 class="page-title">' + esc(t('bookmarks')) + '</h1>' +
      (list.length ? list.map(function (b) {
        return '<a class="list-item" href="' + esc(b.href) + '"><div class="num">★</div><div><strong>' + esc(b.title) + '</strong><div class="faint">' + esc(b.sub || b.type) + '</div></div></a>';
      }).join('') : '<div class="empty">' + esc(t('emptyBookmarks')) + '</div>');
  }

  function renderSearch() {
    const el = document.getElementById('view-search');
    el.innerHTML = '<h1 class="page-title">' + esc(t('globalSearch')) + '</h1>' +
      '<div class="searchbox">' + icon('search', 18) + '<input class="input" id="g-search" placeholder="' + esc(t('searchPlaceholder')) + '" autofocus></div>' +
      '<p class="faint">' + esc(t('searchHint')) + '</p><div id="g-res"></div>';
    const inp = document.getElementById('g-search');
    inp.addEventListener('input', U.debounce(function () {
      const q = inp.value.trim();
      const box = document.getElementById('g-res');
      if (q.length < 2) { box.innerHTML = ''; return; }
      const hits = MoSearch.search(q);
      box.innerHTML = hits.length ? hits.map(function (h) {
        const lab = h.type === 'quran' ? t('catQuran') : h.type === 'hadith' ? t('catHadith') : h.type === 'dua' ? t('catDua') : h.type === 'guide' ? t('catGuide') : t('pages');
        return '<a class="list-item" href="' + h.href + '"><div class="num">' + esc(lab[0] || '?') + '</div><div><strong>' + esc(h.title) + '</strong><div class="faint">' + esc(lab + ' · ' + (h.sub || '')) + '</div></div></a>';
      }).join('') : '<div class="empty">' + esc(t('notFound')) + '<p>' + esc(t('emptySearch')) + '</p></div>';
    }, 160));
  }

  function renderMore() {
    const el = document.getElementById('view-more');
    el.innerHTML = '<h1 class="page-title">' + esc(t('moreTools')) + '</h1><p class="faint">বাংলা + English</p><div class="more-grid">' +
      moreItems().map(function (it) {
        return '<a href="' + it.href + '"><strong>' + esc(it.bn) + '</strong><span class="more-en">' + esc(it.en) + '</span></a>';
      }).join('') + '</div>';
  }

  function renderAbout() {
    const el = document.getElementById('view-about');
    el.innerHTML = '<h1 class="page-title">' + esc(t('aboutTitle')) + '</h1>' +
      '<p>' + esc(t('aboutBody')) + '</p>' +
      '<h3>' + esc(t('version')) + ' 1.0.0</h3>' +
      '<section class="dev-block" aria-label="Developed by">' +
      '<h3 class="dev-heading">Developed by</h3>' +
      '<p class="dev-name">Meheraj Hossain</p>' +
      '</section>' +
      '<h3>' + esc(t('credits')) + '</h3><p>' + esc(t('creditsBody')) + '</p>' +
      '<p class="note-box">' + esc(t('legal')) + '</p>' +
      '<h3>' + esc(t('privacy')) + '</h3><p>' + esc(t('privacyBody')) + '</p>';
  }

  function renderSettings() {
    const el = document.getElementById('view-settings');
    const n = settings.notifications || {};
    const methods = Object.keys(PrayerEngine.METHODS).map(function (id) {
      const m = PrayerEngine.METHODS[id];
      const label = m.name[MoI18n.lang] || m.name.en;
      return '<option value="' + id + '"' + (settings.method === id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    el.innerHTML = '<h1 class="page-title">' + esc(t('settings')) + '</h1>' +
      block(t('appearance'),
        seg('theme', [['light', t('light')], ['dark', t('dark')], ['system', t('system')]], settings.theme)) +
      block(t('language'),
        seg('lang', [['en', t('enInterface')], ['bn', t('bnInterface')], ['ar', t('arInterface')]], settings.lang)) +
      block(t('prayerSettings'),
        '<label class="field">' + esc(t('calcMethod')) + '<select class="input" id="s-method">' + methods + '</select></label>' +
        '<label class="field" style="margin-top:8px">' + esc(t('asrMethod')) + '<select class="input" id="s-asr">' +
        '<option value="Standard"' + (settings.asrMethod === 'Standard' ? ' selected' : '') + '>' + esc(t('asrStandard')) + '</option>' +
        '<option value="Hanafi"' + (settings.asrMethod !== 'Standard' ? ' selected' : '') + '>' + esc(t('asrHanafi')) + '</option></select></label>' +
        '<label class="field" style="margin-top:8px">' + esc(t('highLatitude')) + '<select class="input" id="s-hl">' +
        [['NightMiddle', t('nightMiddle')], ['AngleBased', t('angleBased')], ['OneSeventh', t('oneSeventh')], ['None', t('none')]].map(function (x) {
          return '<option value="' + x[0] + '"' + (settings.highLat === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field" style="margin-top:8px">' + esc(t('timeFormat')) + '<select class="input" id="s-tf">' +
        '<option value="12"' + (settings.timeFormat !== '24' ? ' selected' : '') + '>' + esc(t('hour12')) + '</option>' +
        '<option value="24"' + (settings.timeFormat === '24' ? ' selected' : '') + '>' + esc(t('hour24')) + '</option></select></label>' +
        (settings.method === 'Custom' ? '<div class="grid-2" style="margin-top:8px"><label class="field">' + esc(t('fajrAngle')) + '<input class="input" id="s-cf" value="' + esc(settings.customAngles.fajr) + '"></label><label class="field">' + esc(t('ishaAngle')) + '<input class="input" id="s-ci" value="' + esc(settings.customAngles.isha) + '"></label></div>' : '') +
        '<h4 style="margin:12px 0 6px">' + esc(t('manualAdj')) + '</h4>' +
        PRAYERS.map(function (p) {
          return '<label class="field">' + esc(t(p)) + '<input class="input" type="number" data-adj="' + p + '" value="' + esc((settings.adjustments || {})[p] || 0) + '"></label>';
        }).join('') +
        '<button class="btn ghost block" id="s-loc" style="margin-top:10px">' + esc(t('changeLocation')) + '</button>'
      ) +
      block(t('notifications'),
        '<p class="note-box">' + esc(t('notifLimited')) + '</p>' +
        tog('n-en', t('enableNotif'), n.enabled) +
        tog('n-at', t('notifAtTime'), n.atTime !== false) +
        tog('n-bf', t('notifBefore'), n.beforeEnabled !== false) +
        '<label class="field">' + esc(t('minutesBefore')) + '<input class="input" id="n-min" type="number" min="1" max="60" value="' + esc(n.beforeMin || 15) + '"></label>' +
        '<label class="field">' + esc(t('sound')) + '<select class="input" id="n-sound">' +
        [['chime', t('chime')], ['soft', t('soft')], ['voice', t('voice')], ['silent', t('silent')]].map(function (x) {
          return '<option value="' + x[0] + '"' + (n.sound === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
        }).join('') + '</select></label>' +
        tog('n-vib', t('vibration'), n.vibrate !== false) +
        PRAYERS.map(function (p) { return tog('n-' + p, t(p), n[p] !== false); }).join('') +
        '<button class="btn block" id="n-test" style="margin-top:8px">' + esc(t('testNotif')) + '</button>' +
        '<p class="faint">' + esc(MoNotify.supported() ? (MoNotify.permission() === 'denied' ? t('notifDenied') : '') : t('notifUnsupported')) + '</p>'
      ) +
      block(t('quran'),
        '<label class="field">' + esc(t('quranFont')) + '<input class="input" type="range" id="s-ar" min="18" max="44" value="' + esc(settings.quran.arabicSize || 28) + '"></label>') +
      block(t('privacy'), '<p>' + esc(t('privacyBody')) + '</p>' +
        '<button class="btn ghost" id="s-export">' + esc(t('exportData')) + '</button> ' +
        '<label class="btn ghost">' + esc(t('importData')) + '<input type="file" id="s-import" accept="application/json" hidden></label>') +
      '<p class="faint">' + esc(t('version')) + ' 1.0.0 · <a href="#/about">' + esc(t('about')) + '</a></p>';

    function block(title, inner) { return '<section class="settings-block card"><h3>' + esc(title) + '</h3>' + inner + '</section>'; }
    function seg(id, opts, cur) {
      return '<div class="seg" id="seg-' + id + '">' + opts.map(function (o) {
        return '<button type="button" data-v="' + o[0] + '" class="' + (cur === o[0] ? 'on' : '') + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    }
    function tog(id, lab, on) {
      return '<div class="toggle"><span>' + esc(lab) + '</span><button type="button" class="switch' + (on ? ' on' : '') + '" id="' + id + '" role="switch" aria-checked="' + on + '"></button></div>';
    }

    bindSeg('theme', function (v) { settings.theme = v; saveSettings(); applyTheme(); });
    bindSeg('lang', function (v) { settings.lang = v; saveSettings(); applyLang(); renderChrome(); renderSettings(); refreshOpenView(); });
    function bindSeg(id, fn) {
      const root = document.getElementById('seg-' + id);
      if (!root) return;
      root.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () { fn(b.getAttribute('data-v')); };
      });
    }
    document.getElementById('s-method').onchange = function () { settings.method = this.value; saveSettings(); recompute(); renderSettings(); };
    document.getElementById('s-asr').onchange = function () { settings.asrMethod = this.value; saveSettings(); recompute(); };
    document.getElementById('s-hl').onchange = function () { settings.highLat = this.value; saveSettings(); recompute(); };
    document.getElementById('s-tf').onchange = function () { settings.timeFormat = this.value; saveSettings(); refreshOpenView(); };
    const cf = document.getElementById('s-cf'), ci = document.getElementById('s-ci');
    if (cf) cf.onchange = function () { settings.customAngles.fajr = Number(this.value) || 18; saveSettings(); recompute(); };
    if (ci) ci.onchange = function () { settings.customAngles.isha = Number(this.value) || 17; saveSettings(); recompute(); };
    el.querySelectorAll('[data-adj]').forEach(function (inp) {
      inp.onchange = function () {
        settings.adjustments = settings.adjustments || {};
        settings.adjustments[inp.getAttribute('data-adj')] = Number(inp.value) || 0;
        saveSettings(); recompute();
      };
    });
    document.getElementById('s-loc').onclick = openLocationModal;
    document.getElementById('s-ar').oninput = function () { settings.quran.arabicSize = Number(this.value); saveSettings(); applyLang(); };

    function bindSwitch(id, fn) {
      const b = document.getElementById(id);
      if (!b) return;
      b.onclick = function () { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); fn(on); };
    }
    bindSwitch('n-en', async function (on) {
      settings.notifications.enabled = on;
      if (on) {
        const p = await MoNotify.request();
        if (p !== 'granted' && p !== 'unsupported') toast(t('notifDenied'));
      }
      saveSettings(); recompute();
    });
    bindSwitch('n-at', function (on) { settings.notifications.atTime = on; saveSettings(); recompute(); });
    bindSwitch('n-bf', function (on) { settings.notifications.beforeEnabled = on; saveSettings(); recompute(); });
    bindSwitch('n-vib', function (on) { settings.notifications.vibrate = on; saveSettings(); });
    PRAYERS.forEach(function (p) {
      bindSwitch('n-' + p, function (on) { settings.notifications[p] = on; saveSettings(); recompute(); });
    });
    document.getElementById('n-min').onchange = function () { settings.notifications.beforeMin = Number(this.value) || 15; saveSettings(); recompute(); };
    document.getElementById('n-sound').onchange = function () { settings.notifications.sound = this.value; settings.notifications.silent = this.value === 'silent'; saveSettings(); };
    document.getElementById('n-test').onclick = async function () {
      if (settings.notifications.enabled) await MoNotify.request();
      MoNotify.test();
      toast(t('testNotifSent'));
    };
    document.getElementById('s-export').onclick = function () {
      U.download('mosalah-data.json', JSON.stringify({ settings: settings, bookmarks: bookmarks(), tracker: MoTracker.loadAll(), tasbih: MoTasbih.load() }, null, 2), 'application/json');
      toast(t('dataExported'));
    };
    document.getElementById('s-import').onchange = function (ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          if (data.settings) { settings = MoStorage.deepMerge(MoStorage.getSettings(), data.settings); saveSettings(); }
          if (data.bookmarks) MoStorage.set('bookmarks', data.bookmarks);
          if (data.tracker) MoStorage.set('tracker', data.tracker);
          if (data.tasbih) MoStorage.set('tasbih', data.tasbih);
          applyTheme(); applyLang(); renderChrome(); recompute();
          toast(t('imported'));
        } catch (e) { toast(t('error')); }
      };
      reader.readAsText(f);
    };
  }

  /* ---------- tick / install / init ---------- */
  function tick() {
    const now = new Date();
    const k = U.todayKey(now);
    if (k !== lastDay) {
      recompute();
      toast(t('dateChange'));
    } else if (route.name === 'dashboard' || !route.name) {
      renderDashboard(true);
    }
    const ram = MoCalendar.ramadanInfo(now);
    document.getElementById('btn-back').hidden = (route.name === 'dashboard' || !route.name);
  }

  function maybeShowInstall() {
    const b = document.getElementById('install-banner');
    if (b && deferredPrompt) b.classList.add('show');
    const btn = document.getElementById('btn-install');
    if (btn) btn.onclick = async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      b.classList.remove('show');
    };
  }

  function setOnlineBar() {
    document.getElementById('offline-bar').classList.toggle('show', !U.isOnline());
  }

  async function init() {
    try { await boot(); }
    catch (err) {
      console.error(err);
      const sp = document.getElementById('splash');
      if (sp) {
        sp.innerHTML = '<p>MoSalah could not start.</p><button class="btn" type="button" onclick="location.reload()">Retry</button>';
      }
    }
  }

  async function boot() {
    settings = MoStorage.getSettings();
    const savedRaw = MoStorage.get('settings', null);
    if (!savedRaw || !savedRaw.lang) {
      const nav = (navigator.language || 'en').toLowerCase();
      settings.lang = nav.indexOf('bn') === 0 ? 'bn' : nav.indexOf('ar') === 0 ? 'ar' : 'en';
    }
    if (!settings.method) settings.method = 'Karachi';
    if (!settings.asrMethod) settings.asrMethod = 'Hanafi';
    applyTheme();
    applyLang();
    if (settings.location && isFinite(settings.location.lat)) geo = settings.location;
    renderChrome();
    recompute();
    document.getElementById('splash').hidden = true;
    document.getElementById('app').hidden = false;
    onRoute();

    if (settings.locationMode !== 'manual' && !MoStorage.get('geoAsked', false) && !MoStorage.get('geoDenied', false)) {
      MoStorage.set('geoAsked', true);
      tryGps(false);
    }

    window.addEventListener('hashchange', onRoute);
    document.getElementById('btn-back').onclick = function () { history.back(); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    window.addEventListener('online', function () { setOnlineBar(); toast(t('online'), 'ok'); });
    window.addEventListener('offline', setOnlineBar);
    setOnlineBar();
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      maybeShowInstall();
    });
    setInterval(tick, 1000);

    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('service-worker.js'); } catch (e) {}
    }
    if (!MoStorage.available) toast(t('storageWarn'));
  }

  window.MoApp = {
    toast: toast,
    navigate: navigate,
    onQiblaHeading: updateQiblaUI
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
