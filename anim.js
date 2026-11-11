/* Движок анимаций: фигурка из суставов, две ключевые позы, обратная кинематика для рук и ног */
const FIG = (() => {
  const UA = 25, FA = 23, TH = 37, SH = 37, TO = 46, HD = 15;
  const lerp = (a, b, t) => a + (b - a) * t;
  const r1 = n => Math.round(n * 10) / 10;

  function ik(a, b, l1, l2, s) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 0.001;
    const dd = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.01, d));
    const ux = dx / d, uy = dy / d;
    const c = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd);
    const h = Math.sqrt(Math.max(0, 1 - c * c));
    return [
      [a[0] + l1 * (ux * c - uy * h * s), a[1] + l1 * (uy * c + ux * h * s)],
      [a[0] + ux * dd, a[1] + uy * dd]
    ];
  }

  function mix(A, B, t) {
    const o = {};
    for (const k in A) {
      const a = A[k], b = k in B ? B[k] : a;
      o[k] = Array.isArray(a) ? [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] : lerp(a, b, t);
    }
    return o;
  }

  const ln = (p, q, cls, w) =>
    `<line x1="${r1(p[0])}" y1="${r1(p[1])}" x2="${r1(q[0])}" y2="${r1(q[1])}" class="${cls}"${w ? ` stroke-width="${w}"` : ''}/>`;
  const limb = (a, j, e, cls) =>
    `<polyline points="${r1(a[0])},${r1(a[1])} ${r1(j[0])},${r1(j[1])} ${r1(e[0])},${r1(e[1])}" class="${cls}"/>`;
  const circ = (p, r, cls) => `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r}" class="${cls}"/>`;

  function props(list) {
    let s = '';
    for (const p of list || []) {
      if (p[0] === 'l') s += ln([p[1], p[2]], [p[3], p[4]], 'f-prop', p[5] || 5);
      else if (p[0] === 'r') s += `<rect x="${p[1]}" y="${p[2]}" width="${p[3]}" height="${p[4]}" rx="2.5" class="f-propfill"/>`;
      else if (p[0] === 'c') s += circ([p[1], p[2]], p[3], 'f-propfill');
      else if (p[0] === 'b') s += ln([p[1], p[2]], [p[3], p[4]], 'f-limb');
    }
    return s;
  }

  function side(ex, t) {
    const A = Object.assign({ n: 0 }, ex.A);
    if (ex.fv && !A.fv) A.fv = ex.fv;
    if (!A.fv) A.fv = [10, 0];
    const P = mix(A, Object.assign({}, A, ex.B), t);
    const tr = P.t * Math.PI / 180, nr = (P.t + P.n) * Math.PI / 180;
    const h = P.h;
    const s = [h[0] + TO * Math.sin(tr), h[1] - TO * Math.cos(tr)];
    const hd = [s[0] + HD * Math.sin(nr), s[1] - HD * Math.cos(nr)];
    const e = ex.e == null ? 1 : ex.e, k = ex.k == null ? -1 : ex.k;
    const [el, ha] = ik(s, P.a, UA, FA, e);
    const [kn, ft] = ik(h, P.f, TH, SH, k);
    let out = '';
    if (!ex.noGround) out += ln([8, 182], [192, 182], 'f-ground', 2);
    out += props(ex.props);
    // дальние конечности
    let ha2 = null, ft2 = null;
    if (P.f2) {
      const r = ik(h, P.f2, TH, SH, ex.k2 == null ? k : ex.k2); ft2 = r[1];
      const fv2 = ex.fv2 || P.fv;
      out += limb(h, r[0], ft2, 'f-limb f-back') + ln(ft2, [ft2[0] + fv2[0], ft2[1] + fv2[1]], 'f-limb f-back');
    }
    if (P.a2) {
      const r = ik(s, P.a2, UA, FA, ex.e2 == null ? e : ex.e2); ha2 = r[1];
      out += limb(s, r[0], ha2, 'f-limb f-back');
    }
    let eqBack = '', eqFront = '';
    for (const q of ex.eq || []) {
      if (q[0] === 'bar') eqFront += circ(ha, q[1] || 13, 'f-plate') + circ(ha, 2.6, 'f-eqfill');
      else if (q[0] === 'db') { eqFront += circ(ha, 6.5, 'f-eqfill'); if (ha2 && ex.db2) eqBack += circ(ha2, 6.5, 'f-eqfill f-eqback'); }
      else if (q[0] === 'kb') eqFront += circ([ha[0], ha[1] + 3], 9, 'f-eqfill');
      else if (q[0] === 'cable') eqBack += ln([q[1], q[2]], ha, 'f-cable', 1.6) + circ([q[1], q[2]], 4, 'f-propfill');
      else if (q[0] === 'pad') eqFront += circ([ft[0] + (q[1] || 0), ft[1] + (q[2] || 0)], 5.5, 'f-eqfill');
      else if (q[0] === 'platform') {
        const p = [ft[0] + 6, ft[1] - 4];
        eqBack += ln([p[0] + 6, p[1] + 7], [p[0] - 13, p[1] - 15], 'f-eq', 5);
      }
    }
    out += eqBack;
    out += ln(h, s, 'f-torso');
    out += circ(hd, 9, 'f-head');
    out += limb(h, kn, ft, 'f-limb') + ln(ft, [ft[0] + P.fv[0], ft[1] + P.fv[1]], 'f-limb');
    out += limb(s, el, ha, 'f-limb');
    out += eqFront;
    return out;
  }

  function front(ex, t) {
    const A = Object.assign({}, ex.A);
    const P = mix(A, Object.assign({}, A, ex.B), t);
    const m = p => [200 - p[0], p[1]];
    const sR = [116, P.sy], hR = [108, P.hy];
    const [el, ha] = ik(sR, P.a, UA, FA, ex.e == null ? 1 : ex.e);
    let out = '';
    if (!ex.noGround) out += ln([8, 182], [192, 182], 'f-ground', 2);
    out += props(ex.props);
    let eqBack = '', eqFront = '';
    for (const q of ex.eq || []) {
      if (q[0] === 'db') {
        for (const p of [ha, m(ha)]) eqFront += `<rect x="${r1(p[0] - 8)}" y="${r1(p[1] - 4)}" width="16" height="8" rx="3" class="f-eqfill"/>`;
      } else if (q[0] === 'latbar') {
        eqBack += ln([100, -12], [100, ha[1]], 'f-cable', 1.6) + ln([52, ha[1]], [148, ha[1]], 'f-eq', 4);
      }
    }
    out += eqBack;
    if (!ex.noLegs) {
      const [kn, ft] = ik(hR, P.f, TH, SH, ex.k == null ? -1 : ex.k);
      out += limb(hR, kn, ft, 'f-limb') + limb(m(hR), m(kn), m(ft), 'f-limb');
      out += ln(ft, [ft[0] + 5, ft[1]], 'f-limb') + ln(m(ft), [m(ft)[0] - 5, ft[1]], 'f-limb');
    }
    out += `<path d="M84 ${r1(P.sy)} L116 ${r1(P.sy)} L108 ${r1(P.hy)} L92 ${r1(P.hy)} Z" class="f-body"/>`;
    out += limb(sR, el, ha, 'f-limb') + limb(m(sR), m(el), m(ha), 'f-limb');
    out += circ([100, P.sy - 16 + (ex.headDy || 0)], 9, 'f-head');
    out += eqFront;
    return out;
  }

  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function phase(ms, slow) {
    const k = slow ? 1.8 : 1;
    const T = [350, 1200, 400, 1500].map(x => x * k);
    let x = ms % (T[0] + T[1] + T[2] + T[3]);
    if (x < T[0]) return 0;
    x -= T[0]; if (x < T[1]) return ease(x / T[1]);
    x -= T[1]; if (x < T[2]) return 1;
    x -= T[2]; return 1 - ease(x / T[3]);
  }

  function inner(fig, t) {
    if (!fig) return generic();
    return fig.v === 'f' ? front(fig, t) : side(fig, t);
  }
  function generic() {
    return `<g transform="translate(100 88)"><rect x="-46" y="-5" width="92" height="10" rx="4" class="f-propfill"/>
      <rect x="-62" y="-28" width="14" height="56" rx="5" class="f-eqfill"/><rect x="48" y="-28" width="14" height="56" rx="5" class="f-eqfill"/>
      <rect x="-74" y="-18" width="10" height="36" rx="4" class="f-eqfill"/><rect x="64" y="-18" width="10" height="36" rx="4" class="f-eqfill"/></g>`;
  }
  function svg(fig, t, label) {
    return `<svg class="fig" viewBox="0 -14 200 202" role="img" aria-label="${label || 'Схема упражнения'}"><g>${inner(fig, t == null ? 0.65 : t)}</g></svg>`;
  }
  /* Запускает анимацию внутри уже вставленного svg.fig; возвращает управление */
  function play(svgEl, fig) {
    const g = svgEl && svgEl.querySelector('g');
    if (!g || !fig) return { stop() {}, toggle() { return false; } };
    let raf = 0, t0 = performance.now(), paused = false, acc = 0;
    const frame = now => {
      g.innerHTML = inner(fig, phase(acc + (now - t0), fig.hold));
      raf = requestAnimationFrame(frame);
    };
    const start = () => { t0 = performance.now(); raf = requestAnimationFrame(frame); };
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) paused = true; else start();
    return {
      stop() { cancelAnimationFrame(raf); },
      toggle() {
        if (paused) { paused = false; start(); }
        else { paused = true; acc += performance.now() - t0; cancelAnimationFrame(raf); }
        return !paused;
      },
      get playing() { return !paused; }
    };
  }
  return { svg, inner, play };
})();
