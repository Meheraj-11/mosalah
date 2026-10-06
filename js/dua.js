(function (global) {
  'use strict';
  global.MoDua = {
    all: function () { return window.DUA_DATA || []; },
    byCat: function (cat) {
      return (window.DUA_DATA || []).filter(function (d) { return d.cat === cat; });
    },
    byId: function (id) {
      return (window.DUA_DATA || []).find(function (d) { return d.id === id; });
    }
  };
})(window);
