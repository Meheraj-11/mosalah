/* MoSalah — localStorage + IndexedDB with corruption guards */
(function (global) {
  'use strict';

  const PREFIX = 'mosalah:';
  const DB_NAME = 'mosalah-db';
  const DB_VER = 1;

  let dbPromise = null;
  let memory = {};
  let lsOk = true;

  try {
    const k = PREFIX + '__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (e) {
    lsOk = false;
  }

  function lsGet(key, fallback) {
    if (!lsOk) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
    }
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      try { localStorage.removeItem(PREFIX + key); } catch (e2) {}
      return fallback;
    }
  }

  function lsSet(key, value) {
    memory[key] = value;
    if (!lsOk) return false;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function lsRemove(key) {
    delete memory[key];
    if (!lsOk) return;
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('quran')) db.createObjectStore('quran');
        if (!db.objectStoreNames.contains('history')) {
          const s = db.createObjectStore('history', { keyPath: 'id' });
          s.createIndex('byDate', 'date', { unique: false });
          s.createIndex('byType', 'type', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return dbPromise;
  }

  function idbOp(store, mode, fn) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          const tx = db.transaction(store, mode);
          const os = tx.objectStore(store);
          const req = fn(os);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  const Storage = {
    available: lsOk,
    get: lsGet,
    set: lsSet,
    remove: lsRemove,

    getSettings: function () {
      const defaults = {
        lang: 'en',
        theme: 'system',
        timeFormat: '12',
        method: 'Karachi',
        asrMethod: 'Hanafi',
        highLat: 'NightMiddle',
        adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        customAngles: { fajr: 18, isha: 18 },
        location: null,
        locationMode: 'auto',
        notifications: {
          enabled: false,
          fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true,
          atTime: true,
          beforeMin: 15,
          beforeEnabled: true,
          sound: 'chime',
          silent: false,
          vibrate: true
        },
        quran: {
          arabicSize: 28,
          translation: 'both',
          reciter: 'ar.alafasy',
          showTransliteration: false
        },
        duaFont: 22,
        installed: false
      };
      return deepMerge(defaults, lsGet('settings', {}) || {});
    },

    saveSettings: function (s) {
      return lsSet('settings', s);
    },

    patchSettings: function (patch) {
      const s = Storage.getSettings();
      const next = deepMerge(s, patch);
      lsSet('settings', next);
      return next;
    },

    idbGet: function (store, key) {
      return idbOp(store, 'readonly', function (os) { return os.get(key); });
    },
    idbSet: function (store, key, value) {
      return idbOp(store, 'readwrite', function (os) { return os.put(value, key); });
    },
    idbDel: function (store, key) {
      return idbOp(store, 'readwrite', function (os) { return os.delete(key); });
    },
    idbAll: function (store) {
      return idbOp(store, 'readonly', function (os) { return os.getAll(); });
    },

    cacheQuran: function (key, data) {
      return Storage.idbSet('quran', key, { saved: Date.now(), data: data });
    },
    getCachedQuran: function (key) {
      return Storage.idbGet('quran', key).then(function (row) {
        return row && row.data ? row.data : null;
      });
    },

    addHistory: function (entry) {
      entry.id = entry.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
      return idbOp('history', 'readwrite', function (os) { return os.put(entry); });
    },

    getHistoryByType: function (type) {
      return openDb().then(function (db) {
        if (!db) return [];
        return new Promise(function (resolve) {
          try {
            const tx = db.transaction('history', 'readonly');
            const idx = tx.objectStore('history').index('byType');
            const req = idx.getAll(type);
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { resolve([]); };
          } catch (e) { resolve([]); }
        });
      });
    }
  };

  function deepMerge(a, b) {
    if (!b || typeof b !== 'object') return a;
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object') {
        out[k] = deepMerge(out[k], b[k]);
      } else {
        out[k] = b[k];
      }
    });
    return out;
  }

  Storage.deepMerge = deepMerge;
  Storage.openDb = openDb;
  global.MoStorage = Storage;
})(window);
