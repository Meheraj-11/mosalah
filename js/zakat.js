(function (global) {
  'use strict';

  /* Educational calculator. Gold nisab 87.48g (commonly used), silver 612.36g.
     Rate 2.5% of zakatable wealth. Not a fatwa. */

  const GOLD_G = 87.48;
  const SILVER_G = 612.36;
  const RATE = 0.025;

  function num(v) {
    const n = Number(String(v).replace(/,/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function compute(input) {
    const goldPrice = num(input.goldPrice);
    const silverPrice = num(input.silverPrice);
    const goldGrams = num(input.goldGrams);
    const silverGrams = num(input.silverGrams);
    const cash = num(input.cash);
    const bank = num(input.bank);
    const goldValIn = num(input.goldValue);
    const silverValIn = num(input.silverValue);
    const invest = num(input.invest);
    const business = num(input.business);
    const debts = num(input.debts);
    const nisabKind = input.nisab === 'silver' ? 'silver' : 'gold';

    const goldValue = goldValIn || (goldGrams * goldPrice);
    const silverValue = silverValIn || (silverGrams * silverPrice);

    const assets = cash + bank + goldValue + silverValue + invest + business;
    const eligible = Math.max(0, assets - debts);

    const goldNisabVal = goldPrice ? GOLD_G * goldPrice : 0;
    const silverNisabVal = silverPrice ? SILVER_G * silverPrice : 0;
    const nisabVal = nisabKind === 'silver' ? silverNisabVal : goldNisabVal;

    const above = nisabVal > 0 ? eligible >= nisabVal : eligible > 0;
    const zakat = above ? eligible * RATE : 0;

    return {
      assets: assets,
      eligible: eligible,
      goldValue: goldValue,
      silverValue: silverValue,
      goldNisabVal: goldNisabVal,
      silverNisabVal: silverNisabVal,
      nisabVal: nisabVal,
      nisabKind: nisabKind,
      above: above,
      zakat: zakat,
      rate: RATE,
      GOLD_G: GOLD_G,
      SILVER_G: SILVER_G
    };
  }

  function fmt(n, lang) {
    try {
      const loc = lang === 'bn' ? 'bn-BD' : lang === 'ar' ? 'ar' : 'en';
      return new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }).format(n || 0);
    } catch (e) {
      return (Math.round((n || 0) * 100) / 100).toLocaleString();
    }
  }

  global.MoZakat = { compute: compute, fmt: fmt, GOLD_G: GOLD_G, SILVER_G: SILVER_G, RATE: RATE };
})(window);
