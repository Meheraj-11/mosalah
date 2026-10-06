(function (global) {
  'use strict';
  global.MoRamadan = {
    info: function (date) { return MoCalendar.ramadanInfo(date || new Date()); }
  };
})(window);
