(function (global) {
  'use strict';
  global.MoNamaz = {
    data: function () { return window.NAMAZ_DATA; },
    prayer: function (id) { return window.NAMAZ_DATA && window.NAMAZ_DATA.prayers[id]; }
  };
})(window);
