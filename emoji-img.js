/* Image-backed emoji: Twemoji first, OpenMoji as a fallback, then the native character.
   This keeps newer emoji and older operating systems from showing empty boxes. */
(function () {
  'use strict';
  const TW = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/';
  const OM = 'https://cdn.jsdelivr.net/npm/openmoji@latest/color/svg/';
  const NAMES = window.EMOJI_NAMES || {};
  const HEX = (cps) => cps.map(c => c.toString(16)).join('-');
  const HEX_UP = (cps) => cps.map(c => c.toString(16).toUpperCase()).join('-');
  const isEmoji = (g) => /\p{Extended_Pictographic}/u.test(g) || /^\p{Regional_Indicator}{1,2}$/u.test(g) || /^[0-9#*]\uFE0F?\u20E3$/.test(g);

  let seg = null;
  try { seg = new Intl.Segmenter('en', { granularity: 'grapheme' }); } catch {}

  function urls(e) {
    const cps = [...e].map(c => c.codePointAt(0));
    const out = [];
    if (cps.length >= 2 && cps[cps.length - 1] === 0x20e3) { // keycap: 1️⃣ -> twemoji 31-20e3.svg, openmoji 0031-FE0F-20E3.svg
      out.push(TW + cps[0].toString(16) + '-20e3.svg', OM + cps[0].toString(16).padStart(4, '0').toUpperCase() + '-FE0F-20E3.svg');
    } else {
      const bare = cps.filter(c => c !== 0xfe0f);
      out.push(TW + HEX(bare) + '.svg');
      if (cps.includes(0x200d)) out.push(TW + HEX(cps) + '.svg'); // a few ZWJ assets keep the variation selector
      out.push(OM + HEX_UP(bare) + '.svg');
      if (cps.includes(0xfe0f)) out.push(OM + HEX_UP(cps) + '.svg');
    }
    return [...new Set(out)];
  }

  function nameOf(e) {
    const n = NAMES[e];
    return n ? n.split('|')[0] : '';
  }
  function words(e) {
    return (NAMES[e] || '').toLowerCase().replace(/\|/g, ' ');
  }

  /* A fixed-size wrapper. The native character stays underneath until an image proves it loaded,
     so a missing asset never turns into a broken-image icon. */
  function node(e, cls) {
    const wrap = document.createElement('span');
    wrap.className = 'ew' + (cls ? ' ' + cls : '');
    wrap.dataset.e = e;
    const ch = document.createElement('span');
    ch.className = 'ch';
    ch.textContent = e;
    const img = document.createElement('img');
    img.className = 'emoji';
    img.alt = e;
    img.draggable = false;
    img.decoding = 'async';
    img.loading = 'lazy';
    const n = nameOf(e);
    if (n) img.title = n;
    const list = urls(e);
    let i = 0;
    img.addEventListener('load', () => wrap.classList.add('ok'));
    img.addEventListener('error', () => { if (++i < list.length) img.src = list[i]; else img.remove(); });
    img.src = list[0];
    wrap.append(ch, img);
    return wrap;
  }

  function parts(text) {
    const s = String(text == null ? '' : text);
    return seg ? [...seg.segment(s)].map(x => x.segment) : [...s];
  }

  /* Append text to an element, swapping every emoji grapheme for an image node. */
  function append(el, text) {
    let plain = '';
    for (const p of parts(text)) {
      if (isEmoji(p)) {
        if (plain) { el.append(plain); plain = ''; }
        el.append(node(p));
      } else plain += p;
    }
    if (plain) el.append(plain);
  }

  window.emojiArt = { node, append, nameOf, words, urls, isEmoji };
})();
