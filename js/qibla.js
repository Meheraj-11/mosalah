/* Qibla compass — true bearing to Kaaba + device heading when sensors exist */
(function (global) {
  'use strict';

  let watching = false;
  let heading = null;
  let handler = null;
  let permissionAsked = false;
  let gotReading = false;

  function qiblaOf(loc) {
    if (!loc || !isFinite(loc.lat) || !isFinite(loc.lng)) return null;
    return MoUtils.qiblaBearing(loc.lat, loc.lng);
  }

  function distanceOf(loc) {
    if (!loc || !isFinite(loc.lat) || !isFinite(loc.lng)) return null;
    return MoUtils.haversineKm(loc.lat, loc.lng, MoUtils.KAABA.lat, MoUtils.KAABA.lng);
  }

  function needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  function hasSensorHint() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') return window.orientation;
    return 0;
  }

  function rawHeading(ev) {
    if (typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)) {
      return MoUtils.fixAngle(ev.webkitCompassHeading);
    }
    if (typeof ev.alpha !== 'number' || isNaN(ev.alpha)) return null;
    if (ev.absolute === false) return null;
    return MoUtils.fixAngle((360 - ev.alpha) + screenAngle());
  }

  function smooth(next) {
    if (heading == null) return next;
    let d = next - heading;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return MoUtils.fixAngle(heading + d * 0.28);
  }

  async function enableCompass() {
    permissionAsked = true;
    try {
      if (needsPermission()) {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return { ok: false, reason: 'denied' };
      }
      start();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error' };
    }
  }

  function start() {
    if (watching) return;
    gotReading = false;
    handler = function (ev) {
      const h = rawHeading(ev);
      if (h == null) return;
      gotReading = true;
      heading = smooth(h);
      if (global.MoApp && MoApp.onQiblaHeading) MoApp.onQiblaHeading(heading, ev);
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    watching = true;
  }

  function stop() {
    if (handler) {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    }
    watching = false;
    handler = null;
    heading = null;
    gotReading = false;
  }

  global.MoQibla = {
    qiblaOf: qiblaOf,
    distanceOf: distanceOf,
    enableCompass: enableCompass,
    start: start,
    stop: stop,
    getHeading: function () { return heading; },
    hasSensorHint: hasSensorHint,
    needsPermission: needsPermission,
    permissionAsked: function () { return permissionAsked; },
    hasReading: function () { return gotReading; }
  };
})(window);
