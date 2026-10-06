(function (global) {
  'use strict';
  global.MoHadith = {
    all: function () { return window.HADITH_DATA || []; },
    byCat: function (cat) {
      const all = window.HADITH_DATA || [];
      if (!cat || cat === 'all') return all;
      return all.filter(function (h) { return h.cat === cat; });
    },
    byId: function (id) {
      return (window.HADITH_DATA || []).find(function (h) { return h.id === id; });
    }
  };
})(window);
