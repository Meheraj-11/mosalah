/* Prayer reminders via Notification API + in-app toasts. Honest about background limits. */
(function (global) {
  'use strict';

  let timers = [];
  let audioCtx = null;

  function supported() {
    return 'Notification' in window;
  }

  function permission() {
    if (!supported()) return 'unsupported';
    return Notification.permission;
  }

  async function request() {
    if (!supported()) return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  function playTone(kind) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      if (kind === 'soft') {
        tone(523.25, now, 0.35, 0.08);
        tone(659.25, now + 0.18, 0.4, 0.07);
      } else if (kind === 'voice') {
        tone(392, now, 0.2, 0.08);
        tone(523.25, now + 0.22, 0.25, 0.08);
        tone(659.25, now + 0.48, 0.45, 0.09);
      } else {
        tone(440, now, 0.18, 0.09);
        tone(554.37, now + 0.16, 0.22, 0.08);
        tone(659.25, now + 0.34, 0.5, 0.1);
      }
    } catch (e) {}
  }

  function tone(freq, start, dur, gain) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(start); o.stop(start + dur + 0.02);
  }

  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const lang = (global.MoI18n && MoI18n.lang) || 'en';
      u.lang = lang === 'bn' ? 'bn-BD' : lang === 'ar' ? 'ar-SA' : 'en-US';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function showBrowser(title, body) {
    if (permission() !== 'granted') return;
    try {
      const n = new Notification(title, {
        body: body,
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/favicon.svg',
        tag: 'mosalah-prayer',
        renotify: true
      });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    } catch (e) {}
  }

  function fire(kind, prayerKey, minutes) {
    const settings = MoStorage.getSettings();
    const n = settings.notifications || {};
    if (!n.enabled) return;
    if (n[prayerKey] === false) return;
    const name = t(prayerKey);
    const title = t('appName');
    const body = minutes
      ? t('prayerSoon', { name: name, min: String(minutes) })
      : t('prayerNow', { name: name });
    if (global.MoApp && MoApp.toast) MoApp.toast(body, 'prayer');
    MoUtils.announce(body);
    if (!n.silent && n.sound !== 'silent') {
      if (n.sound === 'voice') speak(body);
      else playTone(n.sound || 'chime');
    }
    if (n.vibrate !== false) MoUtils.vibrate([80, 40, 80]);
    showBrowser(title, body);
  }

  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
  }

  function schedule(times, date) {
    clearTimers();
    const settings = MoStorage.getSettings();
    const n = settings.notifications || {};
    if (!n.enabled) return;
    const names = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const now = Date.now();
    names.forEach(function (key) {
      if (n[key] === false) return;
      const hours = times[key];
      if (hours == null) return;
      const when = MoUtils.hoursToDate(date, hours);
      if (!when) return;
      const at = when.getTime();
      if (n.atTime !== false && at > now && at - now < 36 * 3600000) {
        timers.push(setTimeout(function () { fire('at', key, 0); }, at - now));
      }
      const beforeMin = Number(n.beforeMin) || 15;
      if (n.beforeEnabled && beforeMin > 0) {
        const b = at - beforeMin * 60000;
        if (b > now && b - now < 36 * 3600000) {
          timers.push(setTimeout(function () { fire('before', key, beforeMin); }, b - now));
        }
      }
    });
  }

  function test() {
    fire('at', 'fajr', 0);
    return true;
  }

  global.MoNotify = {
    supported: supported,
    permission: permission,
    request: request,
    schedule: schedule,
    clear: clearTimers,
    test: test,
    playTone: playTone
  };
})(window);
