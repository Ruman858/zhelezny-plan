'use strict';
/* ====== утилиты ====== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
const fmt = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const DAY = 864e5;
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const dShort = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ====== состояние и хранение ====== */
const KEY = 'ironplan.v1';
const blank = () => ({ v: 1, profile: null, skipOnb: false, weights: [], active: null, nextDay: 0, customEx: [], customProg: [], history: [], cur: null, updatedAt: 0 });
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.v) return Object.assign(blank(), r); } catch (e) {}
  return blank();
}
let S = load();
let cloudDoc = null, pushTimer = 0, pushing = false, dirty = false;
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function save() { S.updatedAt = Date.now(); saveLocal(); schedulePush(); }
function schedulePush() { if (!cloudDoc) return; dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); }
async function push() {
  if (!cloudDoc || pushing || !dirty) return;
  pushing = true; dirty = false;
  try { await cloudDoc.set({ json: JSON.stringify(S), updatedAt: S.updatedAt }); setSync('Сохранено в вашем аккаунте'); }
  catch (e) { setSync('Сохранено на этом устройстве'); }
  pushing = false;
  if (dirty) schedulePush();
}
function setSync(t) { const el = $('#sync'); if (el) el.textContent = t; syncText = t; }
let syncText = 'Сохранено на этом устройстве';
async function cloudInit() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    const doc = db.doc('data/users/' + id + '/state');
    const snap = await doc.get();
    cloudDoc = doc;
    const r = snap.exists ? snap.data() : null;
    if (r && r.json && (r.updatedAt || 0) > (S.updatedAt || 0)) {
      S = Object.assign(blank(), JSON.parse(r.json)); saveLocal();
      if (stack.length && stack[0].t === 'onb' && (S.profile || S.skipOnb)) stack = [];
      render();
    } else if ((S.updatedAt || 0) > ((r && r.updatedAt) || 0)) schedulePush();
    setSync('Сохранено в вашем аккаунте');
  } catch (e) {}
}

/* ====== доступ к данным ====== */
const allEx = () => EX.concat(S.customEx);
const exBy = id => allEx().find(e => e.id === id);
const allProg = () => PROGRAMS.concat(S.customProg);
const progBy = id => allProg().find(p => p.id === id);
const grp = id => GROUPS.find(g => g.id === id) || GROUPS[0];
const curWeight = () => (S.weights.length ? S.weights[S.weights.length - 1].w : S.profile ? S.profile.weight : 0);
function addWeight(w) {
  if (!(w > 20 && w < 400)) return false;
  const k = dayKey(Date.now()), last = S.weights[S.weights.length - 1];
  if (last && dayKey(last.t) === k) last.w = w; else S.weights.push({ t: Date.now(), w });
  if (S.profile) S.profile.weight = w;
  return true;
}
function lastSets(exId) { for (const h of S.history) { const it = h.items.find(i => i.ex === exId); if (it && it.sets.length) return it.sets; } return null; }
function bestSet(exId) {
  let b = null;
  for (const h of S.history) for (const it of h.items) if (it.ex === exId) for (const s of it.sets) if (!b || num(s.w) > num(b.w) || (num(s.w) === num(b.w) && num(s.r) > num(b.r))) b = s;
  return b;
}
const restOf = it => (it.rest == null ? 90 : it.rest);
const hasPh = e => !!e && !e.custom && !!e.id;
const phStyle = e => `style="background-image:url(img/${e.id}.jpg)"`;
function exHistory(exId) {
  const out = [];
  for (const h of S.history) { const it = h.items.find(i => i.ex === exId); if (it && it.sets.length) { let b = it.sets[0]; for (const x of it.sets) if (num(x.w) > num(b.w) || (num(x.w) === num(b.w) && num(x.r) > num(b.r))) b = x; out.push({ t: h.t, s: b }); if (out.length >= 6) break; } }
  return out;
}
const setStr = s => (num(s.w) ? fmt(num(s.w)) + ' кг × ' : '') + (s.r || '—');
const estMin = day => Math.round(day.items.reduce((a, it) => a + (/мин/.test(it.reps) ? (parseInt(it.reps, 10) || 5) * 60 * it.sets : it.sets * (45 + restOf(it))), 0) / 60 + 6);
function goalInfo() {
  const p = S.profile; if (!p || !p.goal || !S.weights.length) return null;
  const start = S.weights[0].w, cur = curWeight(), goal = p.goal;
  const total = Math.abs(start - goal), doneAbs = start > goal ? start - cur : cur - start;
  const pct = total < 0.05 ? (Math.abs(cur - goal) < 0.5 ? 1 : 0) : Math.max(0, Math.min(1, doneAbs / total));
  return { start, cur, goal, left: Math.abs(cur - goal), pct, dir: goal < cur - 0.3 ? -1 : goal > cur + 0.3 ? 1 : 0 };
}
function metrics() {
  const h = S.history, now = Date.now();
  let ton = 0, sets = 0;
  for (const w of h) for (const it of w.items) for (const s of it.sets) { ton += num(s.w) * num(s.r); sets++; }
  const weeks = new Set(h.map(w => weekStart(w.t)));
  let streak = 0, ws = weekStart(now);
  if (!weeks.has(ws)) ws = weekStart(ws - DAY);
  while (weeks.has(ws)) { streak++; ws = weekStart(ws - DAY); }
  const thisWeek = h.filter(w => weekStart(w.t) === weekStart(now)).length;
  return { count: h.length, ton, sets, streak, thisWeek };
}
function badges() {
  const m = metrics(), g = goalInfo();
  return [
    { n: 'Первый шаг', d: 'Первая тренировка', ok: m.count >= 1 },
    { n: 'Втянулся', d: '5 тренировок', ok: m.count >= 5 },
    { n: 'Десятка', d: '10 тренировок', ok: m.count >= 10 },
    { n: 'Завсегдатай', d: '25 тренировок', ok: m.count >= 25 },
    { n: 'Полсотни', d: '50 тренировок', ok: m.count >= 50 },
    { n: 'Режим', d: '3 недели подряд', ok: m.streak >= 3 },
    { n: 'Привычка', d: '8 недель подряд', ok: m.streak >= 8 },
    { n: 'Первая тонна', d: 'Поднято 1000 кг', ok: m.ton >= 1000 },
    { n: 'Грузовик', d: 'Поднято 10 тонн', ok: m.ton >= 10000 },
    { n: 'Полпути', d: 'Половина пути к цели по весу', ok: !!g && g.dir !== 0 && g.pct >= 0.5 || (!!g && g.pct >= 1) },
    { n: 'Цель взята', d: 'Желаемый вес достигнут', ok: !!g && g.pct >= 1 && S.weights.length > 1 }
  ];
}
function recommend(p) {
  if (!p) return 'soft';
  if (p.level === 0) return 'soft';
  const lose = p.goal && p.goal < p.weight - 1;
  if (p.level === 1) return lose ? 'slim' : 'full3';
  return p.days >= 4 ? 'ul4' : 'ppl';
}

/* ====== интерфейс: общее ====== */
let tab = 'today', stack = [], players = [], exFilter = { g: 'all', q: '', k: 'all' }, ed = null, pickCb = null, modalCb = null;
let restEnd = 0, lastSheetKey = '', toastTimer = 0;
const TABS = [
  ['today', 'Сегодня', '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'],
  ['ex', 'Упражнения', '<path d="M3 9v6M6.5 6v12M17.5 6v12M21 9v6M6.5 12h11"/>'],
  ['prog', 'Программы', '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>'],
  ['stats', 'Прогресс', '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'],
  ['me', 'Профиль', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-6 8-6s7 1.5 8 6"/>']
];
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }
function openSheet(o) { stack.push(o); render(); $('#sheet').scrollTop = 0; }
function closeSheet() { stack.pop(); render(); }
function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="card" role="dialog" aria-modal="true">' + html + '</div>'; m.hidden = false; const f = m.querySelector('input,button'); if (f) f.focus(); }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; modalCb = null; }
function confirmBox(text, yes, cb) {
  modalCb = cb;
  modal(`<h2>${esc(text)}</h2><div class="row"><button class="btn danger grow" data-a="mYes">${esc(yes)}</button><button class="btn sec grow" data-a="mNo">Отмена</button></div>`);
}
const thumb = e => (hasPh(e) ? `<div class="ph b" ${phStyle(e)} role="img" aria-label="${esc(e.n)}"></div>` : FIG.svg(e.fig, 0.65, esc(e.n)));
const shead = (title, extra) => `<div class="shead"><div class="wrap"><button class="back" data-a="back" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><div class="ttl">${esc(title)}</div>${extra || ''}</div></div>`;

function render() {
  players.forEach(p => p.stop()); players = [];
  $('#tabs').innerHTML = TABS.map(t => `<button class="tab" data-a="tab" data-id="${t[0]}"${tab === t[0] ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${t[2]}</svg><span>${t[1]}</span></button>`).join('');
  const sh = $('#sheet');
  if (stack.length) {
    const top = stack[stack.length - 1], key = top.t + (top.id || '');
    const keep = key === lastSheetKey ? sh.scrollTop : 0;
    sh.innerHTML = SHEETS[top.t](top);
    sh.hidden = false; sh.scrollTop = keep; lastSheetKey = key;
    document.documentElement.style.overflow = 'hidden';
  } else {
    sh.hidden = true; sh.innerHTML = ''; lastSheetKey = '';
    document.documentElement.style.overflow = '';
    $('#view').innerHTML = VIEWS[tab]();
  }
  wake(!!S.cur && stack.some(x => x.t === 'workout'));
  document.querySelectorAll('[data-anim]').forEach(el => {
    const e = exBy(el.dataset.anim);
    if (e && e.fig) players.push(FIG.play(el.querySelector('svg'), e.fig));
  });
}

let wl = null;
async function wake(on) {
  try {
    if (on && !wl && navigator.wakeLock) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    else if (!on && wl) { const x = wl; wl = null; x.release(); }
  } catch (e) { wl = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.cur && stack.some(x => x.t === 'workout')) wake(true); });
const kindSelect = id => `<select class="in" id="${id}" data-f="exk" aria-label="Оборудование">${[['all', 'Любое оборудование'], ['m', 'Тренажёры'], ['f', 'Штанга и гантели'], ['b', 'Свой вес']].map(o => `<option value="${o[0]}"${exFilter.k === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;

/* ====== вкладки ====== */
const VIEWS = {
  today() {
    const p = S.profile, hr = new Date().getHours();
    const hello = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
    const m = metrics(), target = (p && p.days) || 3;
    let h = `<div class="col" style="gap:4px"><span class="eyebrow">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>${hello}${p && p.name ? ', ' + esc(p.name) : ''}</h1></div>`;
    // следующая тренировка
    if (S.cur) {
      const tot = S.cur.items.reduce((a, i) => a + i.sets.length, 0), dn = S.cur.items.reduce((a, i) => a + i.sets.filter(s => s.done).length, 0);
      h += `<section class="card hero"><span class="eyebrow">Тренировка идёт</span><h2>${esc(S.cur.name)}</h2><div class="bar"><i style="width:${tot ? dn / tot * 100 : 0}%"></i></div><p class="small muted">Сделано подходов: ${dn} из ${tot}</p><button class="btn" data-a="resume">Продолжить</button></section>`;
    } else if (S.active && progBy(S.active)) {
      const pr = progBy(S.active), di = S.nextDay % pr.days.length, d = pr.days[di];
      h += `<section class="card hero"><span class="eyebrow">Следующая тренировка</span><h2>${esc(pr.n)} · ${esc(d.n)}</h2>
        <p class="small muted">${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')} · около ${estMin(d)} мин</p>
        <p class="small">${d.items.map(i => esc((exBy(i.ex) || {}).n || '')).filter(Boolean).join(' · ')}</p>
        <button class="btn" data-a="startDay" data-id="${pr.id}" data-d="${di}">Начать тренировку</button></section>`;
    } else {
      const r = progBy(recommend(p));
      h += `<section class="card hero"><span class="eyebrow">С чего начать</span><h2>Выберите программу</h2><p class="small muted">Программа говорит, что делать в каждый визит в зал. ${p ? 'По вашему профилю подойдёт' : 'Для первого месяца подойдёт'} «${esc(r.n)}».</p><button class="btn" data-a="prog" data-id="${r.id}">Открыть «${esc(r.n)}»</button></section>`;
    }
    // неделя
    const ws = weekStart(Date.now()), trained = new Set(S.history.map(w => dayKey(w.t))), tk = dayKey(Date.now());
    h += `<section class="card"><div class="row between"><h2>Эта неделя</h2><span class="chip ${m.thisWeek >= target ? 'ok' : ''} num">${m.thisWeek} из ${target}</span></div><div class="week">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((n, i) => { const t = ws + i * DAY + DAY / 2, k = dayKey(t); return `<div class="d">${n}<span class="c${trained.has(k) ? ' on' : ''}${k === tk ? ' today' : ''}">${new Date(t).getDate()}</span></div>`; }).join('')}</div>
      ${m.streak > 1 ? `<p class="small muted">Вы тренируетесь ${m.streak} ${plural(m.streak, 'неделю', 'недели', 'недель')} подряд. Не прерывайте серию.</p>` : m.count === 0 ? '<p class="small muted">Здесь появятся отметки о тренировках.</p>' : ''}</section>`;
    h += `<p class="quote">${QUOTES[Math.floor(Date.now() / DAY) % QUOTES.length]}</p>`;
    // цель по весу
    const g = goalInfo();
    if (g) {
      h += `<section class="card"><div class="row between"><h2>Путь к цели</h2><span class="chip num">${Math.round(g.pct * 100)}%</span></div>
        <div class="bar"><i style="width:${g.pct * 100}%"></i></div>
        <div class="grid3"><div><span class="small muted">Старт</span><br><b class="num">${fmt(g.start)} кг</b></div><div><span class="small muted">Сейчас</span><br><b class="num">${fmt(g.cur)} кг</b></div><div><span class="small muted">Цель</span><br><b class="num">${fmt(g.goal)} кг</b></div></div>
        <p class="small muted">${g.pct >= 1 ? 'Цель достигнута. Отличная работа!' : 'Осталось ' + fmt(g.left) + ' кг.'}</p>
        <button class="btn sec" data-a="weigh">Записать вес</button></section>`;
    } else {
      h += `<section class="card flat"><h2>Расскажите о себе</h2><p class="small muted">Укажите рост, вес и желаемый вес. Приложение посчитает ориентиры по питанию и покажет путь к цели.</p><button class="btn sec" data-a="tab" data-id="me">Заполнить профиль</button></section>`;
    }
    h += `<div class="grid2"><button class="btn sec" data-a="guide">Гид для новичка</button><button class="btn sec" data-a="startFree">Свободная тренировка</button></div>`;
    return h;
  },

  ex() {
    return `<div class="row between"><h1>Упражнения</h1><button class="btn sm sec" data-a="exNew">+ Своё</button></div>
      <div class="filters"><input class="in" id="exq" type="search" placeholder="Поиск: жим, спина…" value="${esc(exFilter.q)}" data-f="exq" aria-label="Поиск упражнений">${kindSelect('exk')}</div>
      ${groupChips('exG')}<p class="small muted" id="excount">${exCount()}</p><div class="exgrid" id="exgrid">${exGrid()}</div>`;
  },

  prog() {
    const card = p => `<button class="card" style="text-align:left" data-a="prog" data-id="${p.id}"><div class="row between"><h2>${esc(p.n)}</h2>${S.active === p.id ? '<span class="chip ok">Активная</span>' : ''}</div>
      <div class="row">${[p.lvl, p.per, p.goal].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div><p class="small muted">${esc(p.d || '')}</p>
      <p class="small">${p.days.length} ${plural(p.days.length, 'тренировочный день', 'тренировочных дня', 'тренировочных дней')}</p></button>`;
    return `<h1>Программы</h1><p class="muted">Готовые планы от простого к сложному. Активная программа подсказывает на главном экране, что делать сегодня.</p>
      ${PROGRAMS.map(card).join('')}
      <div class="row between" style="margin-top:8px"><h2>Мои программы</h2><button class="btn sm sec" data-a="edNew">+ Создать</button></div>
      ${S.customProg.length ? S.customProg.map(card).join('') : '<section class="card flat"><p class="small muted">Соберите свою программу из любых упражнений базы и собственных. Нажмите «Создать», дайте название и добавьте упражнения по дням.</p></section>'}`;
  },

  stats() {
    const m = metrics();
    let h = `<h1>Прогресс</h1><div class="stats"><div class="stat"><b>${m.count}</b><span>${plural(m.count, 'тренировка', 'тренировки', 'тренировок')}</span></div><div class="stat"><b>${m.streak}</b><span>${plural(m.streak, 'неделя', 'недели', 'недель')} подряд</span></div><div class="stat"><b>${m.ton >= 1000 ? fmt(m.ton / 1000) + ' т' : Math.round(m.ton) + ' кг'}</b><span>поднято всего</span></div></div>`;
    h += `<section class="card"><div class="row between"><h2>Вес</h2><button class="btn sm sec" data-a="weigh">Записать вес</button></div>${chart()}</section>`;
    h += `<section class="card"><h2>Достижения</h2><div class="badges">${badges().map(b => `<div class="badge${b.ok ? ' on' : ''}"><b>${b.ok ? '★ ' : ''}${b.n}</b><span>${b.d}</span></div>`).join('')}</div></section>`;
    h += `<h2 style="margin-top:6px">История тренировок</h2>`;
    if (!S.history.length) h += '<section class="card flat"><p class="small muted">Завершите первую тренировку, и она появится здесь со всеми подходами и весами.</p></section>';
    else h += S.history.slice(0, 40).map(w => `<details class="acc"><summary><span>${esc(w.name)}<br><span class="small muted" style="font-weight:400">${dShort(w.t)} · ${w.dur} мин · ${w.items.reduce((a, i) => a + i.sets.length, 0)} подх.</span></span></summary>
      <div style="padding:0 16px 14px" class="col"><dl class="kv">${w.items.map(i => `<dt>${esc((exBy(i.ex) || { n: 'Удалённое упражнение' }).n)}</dt><dd class="small">${i.sets.map(setStr).join(' · ')}</dd>`).join('')}</dl><button class="btn ghost sm" style="align-self:flex-start;color:var(--bad)" data-a="histDel" data-id="${w.id}">Удалить запись</button></div></details>`).join('');
    return h;
  },

  me() {
    const p = S.profile;
    let h = `<h1>Профиль</h1><section class="card">${profileForm()}<button class="btn" data-a="pfSave">Сохранить</button></section>`;
    if (p && p.height && p.weight) {
      const hm = p.height / 100, bmi = p.weight / (hm * hm);
      const cat = bmi < 18.5 ? 'ниже нормы' : bmi < 25 ? 'норма' : bmi < 30 ? 'выше нормы' : 'значительно выше нормы';
      const bmr = 10 * p.weight + 6.25 * p.height - 5 * (p.age || 30) + (p.sex === 'f' ? -161 : 5);
      const tdee = bmr * (p.days <= 2 ? 1.375 : p.days <= 3 ? 1.45 : p.days <= 4 ? 1.55 : 1.65);
      const dir = p.goal ? (p.goal < p.weight - 0.5 ? -1 : p.goal > p.weight + 0.5 ? 1 : 0) : 0;
      const kcal = Math.round(tdee * (dir < 0 ? 0.85 : dir > 0 ? 1.1 : 1) / 10) * 10;
      const perWeek = dir < 0 ? p.weight * 0.007 : 0.25, weeks = dir ? Math.ceil(Math.abs(p.goal - p.weight) / perWeek) : 0;
      h += `<section class="card"><h2>Ваши ориентиры</h2><dl class="kv">
        <dt>Индекс массы тела</dt><dd>${fmt(bmi)} · ${cat}</dd>
        <dt>Здоровый вес при вашем росте</dt><dd>${Math.round(18.5 * hm * hm)}–${Math.round(25 * hm * hm)} кг</dd>
        <dt>Расход энергии в день</dt><dd>≈ ${Math.round(tdee / 10) * 10} ккал</dd>
        <dt>${dir < 0 ? 'Для снижения веса' : dir > 0 ? 'Для набора веса' : 'Для поддержания веса'}</dt><dd>≈ ${kcal} ккал</dd>
        <dt>Белок в день</dt><dd>${Math.round(p.weight * 1.6)}–${Math.round(p.weight * 2)} г</dd>
        ${dir ? `<dt>Разумный темп</dt><dd>${fmt(perWeek)} кг в неделю</dd><dt>До цели при таком темпе</dt><dd>≈ ${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}</dd>` : ''}
        </dl><p class="small muted">Это расчётные ориентиры по формуле Миффлина — Сан Жеора, а не медицинская рекомендация. При заболеваниях посоветуйтесь с врачом.</p>
        ${p.goal ? `<p class="small">Рекомендуемая программа: <button class="btn ghost sm" data-a="prog" data-id="${recommend(p)}">«${esc(progBy(recommend(p)).n)}»</button></p>` : ''}</section>`;
    }
    h += `<section class="card"><h2>Данные</h2><p class="small muted">${esc(syncText)}. ${cloudDoc ? 'Записи видны только вам и доступны с любого устройства, где вы вошли в аккаунт.' : 'Записи хранятся в памяти браузера на этом устройстве.'}</p>${window.claude ? '' : '<p class="small muted">Данные живут только на этом устройстве. Время от времени сохраняйте копию в файл: она пригодится при смене телефона или очистке браузера.</p><div class="grid2"><button class="btn sec" data-a="backup">Сохранить копию</button><label class="btn sec" style="cursor:pointer">Восстановить<input type="file" id="imp" accept="application/json,.json" hidden></label></div>'}<button class="btn danger" data-a="reset">Сбросить все данные</button></section><p class="small muted">Фотографии упражнений: открытая база free-exercise-db (общественное достояние).</p>`;
    return h;
  }
};

function profileForm() {
  const p = S.profile || {};
  const opt = (v, cur, t) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${t}</option>`;
  return `<label class="f">Как вас зовут<input class="in" id="pf-name" autocomplete="given-name" value="${esc(p.name || '')}" placeholder="Имя"></label>
    <div class="grid2"><label class="f">Пол<select class="in" id="pf-sex">${opt('m', p.sex || 'm', 'Мужской')}${opt('f', p.sex, 'Женский')}</select></label>
    <label class="f">Возраст, лет<input class="in" id="pf-age" inputmode="numeric" value="${p.age || ''}" placeholder="30"></label></div>
    <div class="grid3"><label class="f">Рост, см<input class="in" id="pf-height" inputmode="decimal" value="${p.height || ''}" placeholder="178"></label>
    <label class="f">Вес, кг<input class="in" id="pf-weight" inputmode="decimal" value="${p.weight ? fmt(p.weight) : ''}" placeholder="82"></label>
    <label class="f">Желаемый вес, кг<input class="in" id="pf-goal" inputmode="decimal" value="${p.goal ? fmt(p.goal) : ''}" placeholder="75"></label></div>
    <div class="grid2"><label class="f">Опыт в зале<select class="in" id="pf-level">${opt(0, p.level == null ? 0 : p.level, 'Не занимался')}${opt(1, p.level, 'До полугода')}${opt(2, p.level, 'Больше полугода')}</select></label>
    <label class="f">Тренировок в неделю<select class="in" id="pf-days">${[2, 3, 4, 5, 6].map(d => opt(d, p.days || 3, d)).join('')}</select></label></div>`;
}
function readProfile() {
  const v = id => ($('#pf-' + id) || {}).value || '';
  const p = { name: v('name').trim().slice(0, 40), sex: v('sex'), age: Math.round(num(v('age'))), height: num(v('height')), weight: num(v('weight')), goal: num(v('goal')), level: +v('level'), days: +v('days') };
  if (!(p.height >= 100 && p.height <= 250)) return 'Укажите рост в сантиметрах, например 178.';
  if (!(p.weight >= 30 && p.weight <= 300)) return 'Укажите вес в килограммах, например 82.';
  if (p.goal && !(p.goal >= 30 && p.goal <= 300)) return 'Желаемый вес должен быть от 30 до 300 кг.';
  if (p.age && !(p.age >= 12 && p.age <= 100)) return 'Проверьте возраст.';
  return p;
}

function groupChips(act) {
  return `<div class="chips"><button class="chip${exFilter.g === 'all' ? ' on' : ''}" data-a="${act}" data-id="all">Все</button>${GROUPS.map(g => `<button class="chip${exFilter.g === g.id ? ' on' : ''}" data-a="${act}" data-id="${g.id}"><i class="dot" style="background:${g.c}"></i>${g.n}</button>`).join('')}</div>`;
}
const exCount = () => { const n = filteredEx().length; return n + ' ' + plural(n, 'упражнение', 'упражнения', 'упражнений'); };
function filteredEx() {
  const q = exFilter.q.trim().toLowerCase();
  return allEx().filter(e => (exFilter.g === 'all' || e.g === exFilter.g) && (!exFilter.k || exFilter.k === 'all' || e.k === exFilter.k) && (!q || (e.n + ' ' + (e.m || '') + ' ' + (e.q || '') + ' ' + grp(e.g).n).toLowerCase().includes(q)));
}
function exGrid() {
  const l = filteredEx();
  if (!l.length) return '<p class="muted" style="grid-column:1/-1">Ничего не найдено. Измените запрос или добавьте своё упражнение.</p>';
  return l.map(e => `<button class="excard" data-a="ex" data-id="${e.id}"><div class="thumb${hasPh(e) ? ' pht' : ''}">${thumb(e)}</div><div class="meta"><span class="name">${esc(e.n)}</span><span class="small muted"><i class="dot" style="background:${grp(e.g).c}"></i> ${grp(e.g).n}</span><span class="small muted">${e.custom ? 'Своё упражнение' : LEVELS[e.lvl]}</span></div></button>`).join('');
}
function exRows(act) {
  const l = filteredEx();
  if (!l.length) return '<p class="muted">Ничего не найдено.</p>';
  return l.map(e => `<button class="exrow" data-a="${act}" data-id="${e.id}"><div class="mini">${thumb(e)}</div><div class="grow"><div class="name">${esc(e.n)}</div><div class="small muted">${grp(e.g).n}${e.q ? ' · ' + esc(e.q) : ''}</div></div></button>`).join('');
}
function chart() {
  const w = S.weights, goal = S.profile && S.profile.goal;
  if (!w.length) return '<p class="small muted">Запишите вес, и здесь появится график. Взвешивайтесь раз в неделю утром натощак: так цифры честнее.</p>';
  const W = 320, H = 150, pl = 36, pr = 12, pt = 14, pb = 24;
  const vals = w.map(x => x.w).concat(goal ? [goal] : []);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx - mn < 2) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.12, lo = mn - pad, hi = mx + pad;
  const t0 = w[0].t, t1 = w[w.length - 1].t;
  const X = t => (t1 === t0 ? pl + (W - pl - pr) / 2 : pl + (t - t0) / (t1 - t0) * (W - pl - pr));
  const Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const pts = w.map(p => X(p.t).toFixed(1) + ',' + Y(p.w).toFixed(1));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="График веса">`;
  for (const v of [mn, mx]) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  if (goal) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--ok)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - pr}" y="${Y(goal) - 5}" text-anchor="end" style="fill:var(--ok)">цель ${fmt(goal)}</text>`;
  if (w.length > 1) s += `<polygon points="${pl},${H - pb} ${pts.join(' ')} ${W - pr},${H - pb}" fill="var(--accent)" fill-opacity=".1"/><polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const L = w[w.length - 1];
  s += `<circle cx="${X(L.t)}" cy="${Y(L.w)}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  s += `<text x="${pl}" y="${H - 6}">${dShort(t0)}</text>${t1 !== t0 ? `<text x="${W - pr}" y="${H - 6}" text-anchor="end">${dShort(t1)}</text>` : ''}</svg>`;
  return s + `<p class="small muted">Сейчас ${fmt(L.w)} кг${w.length > 1 ? ', изменение с начала: ' + (L.w - w[0].w > 0 ? '+' : '') + fmt(L.w - w[0].w) + ' кг' : ''}.</p>`;
}

/* ====== листы ====== */
const SHEETS = {
  onb() {
    return `<div class="wrap sbody" style="padding-top:28px"><div class="col" style="gap:8px"><span class="eyebrow">Добро пожаловать</span><h1>Зал без растерянности</h1>
      <p class="muted">Здесь есть база упражнений с анимацией техники и разбором ошибок, готовые программы и дневник тренировок. Расскажите немного о себе, и приложение подберёт, с чего начать.</p></div>
      <section class="card">${profileForm()}</section>
      <button class="btn wide" data-a="onbSave">Начать</button><button class="btn ghost wide" data-a="onbSkip">Заполню позже</button></div>`;
  },

  ex(o) {
    const e = exBy(o.id); if (!e) return shead('Упражнение') + '<div class="wrap sbody"><p>Упражнение удалено.</p></div>';
    const g = grp(e.g), best = bestSet(e.id), last = lastSets(e.id), hist = exHistory(e.id);
    const view = hasPh(e) ? (e.fig ? o.view || 'ph' : 'ph') : 'fig';
    let h = shead(g.n) + `<div class="wrap sbody">
      ${hasPh(e) && e.fig ? `<div class="seg"><button class="${view === 'ph' ? 'on' : ''}" data-a="exView" data-v="ph">Фото</button><button class="${view === 'fig' ? 'on' : ''}" data-a="exView" data-v="fig">Схема движения</button></div>` : ''}
      ${view === 'ph' ? `<div class="stage"><div class="ph swap" id="exph" ${phStyle(e)} role="img" aria-label="${esc(e.n)}: начало и конец движения"></div><button class="btn sm sec play" data-a="phToggle">Пауза</button></div><p class="small muted" style="margin-top:-8px">Кадры сменяются: исходное положение и конечная точка движения.</p>`
      : `<div class="stage" data-anim="${e.id}">${FIG.svg(e.fig, 0, esc(e.n))}${e.fig ? '<button class="btn sm sec play" data-a="animToggle">Пауза</button>' : ''}</div>`}
      <div class="col" style="gap:8px"><h1>${esc(e.n)}</h1><div class="row"><span class="chip"><i class="dot" style="background:${g.c}"></i>${g.n}</span>${e.lvl ? `<span class="chip">${LEVELS[e.lvl]}</span>` : '<span class="chip">Своё упражнение</span>'}${e.q ? `<span class="chip">${esc(e.q)}</span>` : ''}</div></div>
      ${e.m ? `<p><b>Работают:</b> ${esc(e.m)}</p>` : ''}${e.d ? `<p>${esc(e.d)}</p>` : ''}`;
    if (e.st && e.st.length) h += `<section class="card"><h2>Как выполнять</h2><ol class="steps">${e.st.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol></section>`;
    if (e.er && e.er.length) h += `<section class="card"><h2>Частые ошибки</h2><div class="errs">${e.er.map(x => `<div class="err"><span class="x" aria-hidden="true">✕</span><div><b>${esc(x[0])}</b>${x[1] ? `<span class="muted">${esc(x[1])}</span>` : ''}</div></div>`).join('')}</div></section>`;
    if (e.tip) h += `<div class="tipbox"><b>Совет.</b> ${esc(e.tip)}</div>`;
    h += `<section class="card"><h2>Нагрузка</h2><dl class="kv"><dt>Для начала</dt><dd>${e.sets || 3} × ${esc(e.reps || '10–12')}</dd>${e.rest === 0 ? '' : `<dt>Отдых между подходами</dt><dd>${e.rest || 90} с</dd>`}
      ${last ? `<dt>В прошлый раз</dt><dd class="small">${last.map(setStr).join(' · ')}</dd>` : ''}${best && num(best.w) ? `<dt>Ваш лучший подход</dt><dd>${setStr(best)}</dd>` : ''}</dl>
      ${e.unit === 'min' ? '' : '<p class="small muted">Дыхание: выдох на усилии, вдох при возврате в исходное положение.</p>'}</section>`;
    if (hist.length > 1) h += `<section class="card"><h2>Ваши результаты</h2><dl class="kv">${hist.map(x => `<dt>${dShort(x.t)}</dt><dd>${setStr(x.s)}</dd>`).join('')}</dl>${num(hist[0].s.w) > num(hist[hist.length - 1].s.w) ? `<p class="small" style="color:var(--ok)">Рост: +${fmt(num(hist[0].s.w) - num(hist[hist.length - 1].s.w))} кг за ${hist.length} ${plural(hist.length, 'тренировку', 'тренировки', 'тренировок')}.</p>` : ''}</section>`;
    if (e.custom) h += `<div class="row"><button class="btn sec grow" data-a="exEdit" data-id="${e.id}">Изменить</button><button class="btn danger grow" data-a="exDel" data-id="${e.id}">Удалить</button></div>`;
    h += '</div>';
    if (S.cur && !o.noAdd) h += `<div class="sfoot"><div class="wrap"><button class="btn" data-a="wAddThis" data-id="${e.id}">Добавить в текущую тренировку</button></div></div>`;
    return h;
  },

  prog(o) {
    const p = progBy(o.id); if (!p) return shead('Программа') + '<div class="wrap sbody"><p>Программа удалена.</p></div>';
    const act = S.active === p.id;
    let h = shead('Программа') + `<div class="wrap sbody"><div class="col" style="gap:8px"><h1>${esc(p.n)}</h1><div class="row">${[p.lvl, p.per, p.weeks, p.goal].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('')}${act ? '<span class="chip ok">Активная</span>' : ''}</div></div>${p.d ? `<p>${esc(p.d)}</p>` : ''}`;
    if (!p.custom) h += `<div class="tipbox"><b>Как пользоваться.</b> Чередуйте дни по порядку, между тренировками отдыхайте минимум день. Перед началом 5–10 минут разминки.</div>`;
    p.days.forEach((d, i) => {
      h += `<section class="card"><div class="row between"><h2>${esc(d.n)}</h2><span class="small muted">около ${estMin(d)} мин</span></div><div class="list">${d.items.map(it => { const e = exBy(it.ex); return e ? `<button class="exrow" data-a="ex" data-id="${e.id}"><div class="mini">${thumb(e)}</div><div class="grow"><div class="name">${esc(e.n)}</div><div class="small muted num">${it.sets} × ${esc(it.reps)}${restOf(it) ? ' · отдых ' + restOf(it) + ' с' : ''}</div></div></button>` : ''; }).join('') || '<p class="small muted">В этом дне пока нет упражнений.</p>'}</div>
        ${d.items.length ? `<button class="btn sec" data-a="startDay" data-id="${p.id}" data-d="${i}">Начать «${esc(d.n)}»</button>` : ''}</section>`;
    });
    if (p.custom) h += `<div class="row"><button class="btn sec grow" data-a="edEdit" data-id="${p.id}">Изменить</button><button class="btn danger grow" data-a="progDel" data-id="${p.id}">Удалить</button></div>`;
    h += `</div><div class="sfoot"><div class="wrap">${act ? '<button class="btn sec" data-a="progOff">Снять с главного экрана</button>' : `<button class="btn" data-a="progOn" data-id="${p.id}">Сделать активной</button>`}</div></div>`;
    return h;
  },

  workout() {
    const c = S.cur; if (!c) return shead('Тренировка') + '<div class="wrap sbody"><p>Нет активной тренировки.</p></div>';
    const tot = c.items.reduce((a, i) => a + i.sets.length, 0), dn = c.items.reduce((a, i) => a + i.sets.filter(s => s.done).length, 0);
    let h = shead(c.name, `<span class="chip num" id="wtime">${mmss((Date.now() - c.start) / 1000)}</span>`) + `<div class="wrap sbody">
      <div class="col" style="gap:6px"><div class="bar"><i style="width:${tot ? dn / tot * 100 : 0}%"></i></div><span class="small muted num">Подходов сделано: ${dn} из ${tot}</span></div>`;
    if (restEnd > Date.now()) h += `<div class="rest"><span>Отдых</span><span class="t" id="restt">${mmss((restEnd - Date.now()) / 1000)}</span><span class="row"><button class="btn sm" data-a="restAdd">+30 с</button><button class="btn sm" data-a="restSkip">Пропустить</button></span></div>`;
    if (!c.warm && c.items.length && (exBy(c.items[0].ex) || {}).g !== 'cardio' && !c.items.some(i => i.sets.some(x => x.done))) h += '<section class="card flat"><h2>Сначала разминка</h2><p class="small muted">5–7 минут лёгкого кардио и вращения в суставах. Перед первым тяжёлым упражнением сделайте 1–2 подхода с половиной рабочего веса.</p><button class="btn sec sm" style="align-self:flex-start" data-a="wWarm">Размялся</button></section>';
    if (!c.items.length) h += '<section class="card flat"><p class="muted">Добавьте первое упражнение из базы, отмечайте подходы, а приложение запомнит веса на следующий раз.</p></section>';
    c.items.forEach((it, i) => {
      const e = exBy(it.ex) || { n: 'Удалённое упражнение', id: '' }, d = it.sets.filter(s => s.done).length, all = it.sets.length && d === it.sets.length, open = c.open === i;
      const last = lastSets(it.ex);
      h += `<section class="card wex${all ? ' done' : ''}"><button class="head" data-a="wOpen" data-i="${i}" aria-expanded="${open}"><div class="mini">${thumb(e)}</div><div class="grow"><div style="font-weight:600;line-height:1.3">${esc(e.n)}</div><div class="small muted num">${it.sets.length} × ${esc(it.reps || '')} · сделано ${d} из ${it.sets.length}</div></div>${all ? '<span class="chip ok">Готово</span>' : ''}</button>`;
      if (open) {
        h += `${hasPh(e) ? `<div class="stage"><div class="ph swap" ${phStyle(e)} role="img" aria-label="${esc(e.n)}"></div></div>` : e.fig ? `<div class="stage" data-anim="${e.id}" style="max-height:230px"><div style="max-width:230px;margin:0 auto">${FIG.svg(e.fig, 0, esc(e.n))}</div></div>` : ''}
          <div class="row between"><button class="btn ghost sm" data-a="ex" data-id="${e.id}" data-noadd="1">Техника и ошибки</button>${last ? `<span class="small muted num">Прошлый раз: ${last.map(setStr).join(' · ')}</span>` : '<span class="small muted">Вес подбирайте с запасом в 2–3 повтора</span>'}</div>
          <div class="sets"><span class="h">№</span><span class="h">Вес, кг</span><span class="h">${e.unit === 'min' ? 'Минуты' : e.timed ? 'Секунды' : 'Повторы'}</span><span class="h">Готово</span>
          ${it.sets.map((s, j) => `<span class="n">${j + 1}</span><input class="in num" id="w${i}_${j}" inputmode="decimal" value="${esc(s.w)}" placeholder="—" data-f="set" data-i="${i}" data-j="${j}" data-k="w" aria-label="Вес, подход ${j + 1}"><input class="in num" id="r${i}_${j}" inputmode="numeric" value="${esc(s.r)}" placeholder="—" data-f="set" data-i="${i}" data-j="${j}" data-k="r" aria-label="Повторы, подход ${j + 1}"><button class="check${s.done ? ' on' : ''}" data-a="wCheck" data-i="${i}" data-j="${j}" aria-label="Подход ${j + 1} выполнен" aria-pressed="${!!s.done}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`).join('')}</div>
          <div class="row"><button class="btn sm sec" data-a="wAddSet" data-i="${i}">+ Подход</button>${it.sets.length > 1 ? `<button class="btn sm sec" data-a="wDelSet" data-i="${i}">− Подход</button>` : ''}<span class="grow"></span><button class="btn ghost sm" data-a="wSwap" data-i="${i}">Заменить</button><button class="btn ghost sm" style="color:var(--bad)" data-a="wDelEx" data-i="${i}">Убрать</button></div>`;
      }
      h += '</section>';
    });
    h += `<button class="btn sec" data-a="wAddEx">+ Добавить упражнение</button><button class="btn ghost" style="color:var(--bad)" data-a="wCancel">Отменить тренировку</button></div>
      <div class="sfoot"><div class="wrap"><button class="btn" data-a="wFinish">Завершить тренировку</button></div></div>`;
    return h;
  },

  done(o) {
    const d = o.data;
    return `<div class="wrap sbody" style="padding-top:36px"><span class="eyebrow">Тренировка завершена</span><h1>${d.count === 1 ? 'Первая тренировка позади. Самое трудное сделано!' : 'Отличная работа' + (S.profile && S.profile.name ? ', ' + esc(S.profile.name) : '') + '!'}</h1>
      <div class="stats"><div class="stat"><b>${d.dur}</b><span>минут</span></div><div class="stat"><b>${d.sets}</b><span>${plural(d.sets, 'подход', 'подхода', 'подходов')}</span></div><div class="stat"><b>${d.ton >= 1000 ? fmt(d.ton / 1000) + ' т' : Math.round(d.ton) + ' кг'}</b><span>поднято</span></div></div>
      ${d.fresh.length ? `<section class="card"><h2>Новые достижения</h2><div class="badges">${d.fresh.map(b => `<div class="badge on"><b>★ ${b.n}</b><span>${b.d}</span></div>`).join('')}</div></section>` : ''}
      <p class="quote">${QUOTES[d.count % QUOTES.length]}</p>
      <p class="muted">Это уже ${d.count}-я тренировка в дневнике. Поешьте в течение пары часов, выспитесь и возвращайтесь через день-два.</p>
      <button class="btn wide" data-a="doneOk">Готово</button></div>`;
  },

  guide() {
    return shead('Гид для новичка') + `<div class="wrap sbody"><div class="col" style="gap:8px"><h1>Всё, что нужно знать перед залом</h1><p class="muted">Десять коротких тем. Прочитайте первые четыре до первой тренировки, остальные по мере появления вопросов.</p></div>
      ${GUIDE.map((g, i) => `<details class="acc"${i === 0 ? ' open' : ''}><summary>${g.t}</summary><ul>${g.b.map(x => `<li>${x}</li>`).join('')}</ul></details>`).join('')}
      <button class="btn" data-a="prog" data-id="soft">Открыть программу «Мягкий старт»</button></div>`;
  },

  picker() {
    return shead('Выберите упражнение') + `<div class="wrap sbody"><input class="in" id="pkq" type="search" placeholder="Поиск упражнения" value="${esc(exFilter.q)}" data-f="pkq" aria-label="Поиск упражнений">${kindSelect('pkk')}${groupChips('pkG')}
      <div class="list" id="pklist">${exRows('pick')}</div><button class="btn sec" data-a="exNew">+ Создать своё упражнение</button></div>`;
  },

  exform(o) {
    const e = (o.id && exBy(o.id)) || {};
    return shead(o.id ? 'Изменить упражнение' : 'Своё упражнение') + `<div class="wrap sbody"><p class="muted">Добавьте упражнение, которого нет в базе. Оно появится в общем списке, его можно включать в программы и тренировки.</p>
      <section class="card"><label class="f">Название<input class="in" id="xf-n" value="${esc(e.n || '')}" placeholder="Например: тяга Т-грифа"></label>
      <div class="grid2"><label class="f">Группа мышц<select class="in" id="xf-g">${GROUPS.map(g => `<option value="${g.id}"${e.g === g.id ? ' selected' : ''}>${g.n}</option>`).join('')}</select></label>
      <label class="f">Оборудование<input class="in" id="xf-q" value="${esc(e.q || '')}" placeholder="Штанга, тренажёр…"></label></div>
      <div class="grid2"><label class="f">Подходов<input class="in" id="xf-sets" inputmode="numeric" value="${e.sets || 3}"></label><label class="f">Повторений<input class="in" id="xf-reps" value="${esc(e.reps || '10–12')}"></label></div>
      <label class="f">Техника: каждый шаг с новой строки<textarea class="in" id="xf-st" placeholder="Исходное положение…&#10;Движение…">${esc((e.st || []).join('\n'))}</textarea></label>
      <label class="f">На что обратить внимание, частые ошибки<textarea class="in" id="xf-er" placeholder="Каждая ошибка с новой строки">${esc((e.er || []).map(x => x[0]).join('\n'))}</textarea></label></section>
      <button class="btn" data-a="exSave" data-id="${o.id || ''}">Сохранить упражнение</button></div>`;
  },

  editor() {
    if (!ed) return shead('Программа') + '<div class="wrap sbody"></div>';
    let h = shead(ed.isNew ? 'Новая программа' : 'Изменить программу') + `<div class="wrap sbody"><section class="card"><label class="f">Название программы<input class="in" id="ed-n" value="${esc(ed.n)}" placeholder="Например: моя программа на массу" data-f="ed" data-p="n"></label>
      <label class="f">Заметка для себя<input class="in" id="ed-d" value="${esc(ed.d || '')}" placeholder="Необязательно" data-f="ed" data-p="d"></label></section>`;
    ed.days.forEach((d, di) => {
      h += `<section class="card"><div class="row"><input class="in grow" id="ed-day${di}" value="${esc(d.n)}" data-f="ed" data-p="days.${di}.n" aria-label="Название дня">${ed.days.length > 1 ? `<button class="icon" data-a="edDelDay" data-d="${di}" aria-label="Удалить день"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}</div>`;
      if (d.items.length) h += `<div class="dayrow small muted"><span>Упражнение</span><span style="text-align:center">Подх.</span><span style="text-align:center">Повт.</span><span></span></div>`;
      d.items.forEach((it, i) => {
        const e = exBy(it.ex) || { n: '—' };
        h += `<div class="dayrow"><span style="font-weight:600;line-height:1.3;min-width:0">${esc(e.n)}</span><input class="in num" id="ed-s${di}_${i}" inputmode="numeric" value="${it.sets}" data-f="ed" data-p="days.${di}.items.${i}.sets" aria-label="Подходов"><input class="in num" id="ed-r${di}_${i}" value="${esc(it.reps)}" data-f="ed" data-p="days.${di}.items.${i}.reps" aria-label="Повторений"><button class="icon" data-a="edDelEx" data-d="${di}" data-i="${i}" aria-label="Убрать упражнение"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
      });
      h += `<button class="btn sec sm" data-a="edAddEx" data-d="${di}">+ Добавить упражнение</button></section>`;
    });
    h += `<button class="btn sec" data-a="edAddDay">+ Добавить день</button></div><div class="sfoot"><div class="wrap"><button class="btn" data-a="edSave">Сохранить программу</button></div></div>`;
    return h;
  }
};

/* ====== тренировка ====== */
function mkItem(exId, sets, reps, rest) {
  const e = exBy(exId) || {}, last = lastSets(exId);
  sets = sets || e.sets || 3; reps = reps || e.reps || '10';
  const r0 = parseInt(reps, 10) || '';
  return { ex: exId, reps: String(reps), rest: rest != null ? rest : e.rest != null ? e.rest : 90, sets: Array.from({ length: sets }, (_, i) => { const l = last && (last[i] || last[last.length - 1]); return { w: l && num(l.w) ? String(l.w) : '', r: r0 === '' ? '' : String(r0), done: false }; }) };
}
function startWorkout(name, items, progId, dayIdx) {
  S.cur = { name, prog: progId || null, day: dayIdx || 0, start: Date.now(), open: 0, items };
  restEnd = 0; save(); stack = [{ t: 'workout' }]; render(); $('#sheet').scrollTop = 0;
}
function beginDay(pid, di) {
  const p = progBy(pid); if (!p) return;
  const d = p.days[di]; if (!d) return;
  startWorkout(p.n + ' · ' + d.n, d.items.filter(it => exBy(it.ex)).map(it => mkItem(it.ex, it.sets, it.reps, it.rest)), pid, di);
}
function finishWorkout() {
  const c = S.cur; if (!c) return;
  const items = c.items.map(it => ({ ex: it.ex, sets: it.sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r })) })).filter(it => it.sets.length);
  if (!items.length) { confirmBox('Ни один подход не отмечен. Закрыть тренировку без записи?', 'Закрыть', () => { S.cur = null; restEnd = 0; save(); stack = []; render(); }); return; }
  const before = badges().filter(b => b.ok).map(b => b.n);
  const dur = Math.max(1, Math.round((Date.now() - c.start) / 60000));
  S.history.unshift({ id: 'h' + Date.now(), t: Date.now(), name: c.name, dur, items });
  if (c.prog && c.prog === S.active) { const p = progBy(c.prog); if (p) S.nextDay = (c.day + 1) % p.days.length; }
  S.cur = null; restEnd = 0; save();
  let ton = 0, sets = 0; for (const it of items) for (const s of it.sets) { ton += num(s.w) * num(s.r); sets++; }
  stack = [{ t: 'done', data: { dur, sets, ton, count: S.history.length, fresh: badges().filter(b => b.ok && !before.includes(b.n)) } }];
  render(); $('#sheet').scrollTop = 0;
}
setInterval(() => {
  const top = stack[stack.length - 1];
  if (S.cur && top && top.t === 'workout') { const el = $('#wtime'); if (el) el.textContent = mmss((Date.now() - S.cur.start) / 1000); }
  if (restEnd) {
    const left = (restEnd - Date.now()) / 1000;
    if (left <= 0) { restEnd = 0; toast('Отдых окончен. Следующий подход!'); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} if (top && top.t === 'workout') render(); }
    else { const el = $('#restt'); if (el) el.textContent = mmss(left); }
  }
}, 500);

/* ====== действия ====== */
const setPath = (obj, path, val) => { const k = path.split('.'); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; };
const A = {
  tab(d) { tab = d.id; stack = []; exFilter = { g: 'all', q: '', k: 'all' }; render(); window.scrollTo(0, 0); },
  back() { const top = stack[stack.length - 1]; if (top && top.t === 'editor') ed = null; if (top && top.t === 'picker') pickCb = null; closeSheet(); },
  ex(d) { openSheet({ t: 'ex', id: d.id, noAdd: !!d.noadd }); },
  prog(d) { openSheet({ t: 'prog', id: d.id }); },
  guide() { openSheet({ t: 'guide' }); },
  exG(d) { exFilter.g = d.id; render(); },
  pkG(d) { exFilter.g = d.id; render(); },
  exView(d) { stack[stack.length - 1].view = d.v; render(); },
  phToggle(d, el) { const p = $('#exph'); if (p) el.textContent = p.classList.toggle('paused') ? 'Показать движение' : 'Пауза'; },
  wWarm() { S.cur.warm = true; saveLocal(); render(); },
  wSwap(d) {
    const it = S.cur.items[+d.i], old = exBy(it.ex);
    pickCb = id => { const e = exBy(id) || {}; it.ex = id; it.reps = e.reps || it.reps; it.rest = e.rest != null ? e.rest : it.rest; const last = lastSets(id), r0 = parseInt(it.reps, 10); it.sets.forEach((x, j) => { if (!x.done) { const l = last && (last[j] || last[last.length - 1]); x.w = l && num(l.w) ? String(l.w) : ''; x.r = isNaN(r0) ? '' : String(r0); } }); };
    exFilter = { g: old ? old.g : 'all', q: '', k: 'all' }; openSheet({ t: 'picker' }); toast('Показаны упражнения на ту же группу мышц');
  },
  animToggle(d, el) { const p = players[0]; if (p) el.textContent = p.toggle() ? 'Пауза' : 'Показать движение'; },

  /* профиль */
  onbSave() { const p = readProfile(); if (typeof p === 'string') return toast(p); applyProfile(p); stack = []; render(); toast('Профиль сохранён. Программа подобрана.'); },
  onbSkip() { S.skipOnb = true; save(); stack = []; render(); },
  pfSave() { const p = readProfile(); if (typeof p === 'string') return toast(p); applyProfile(p); render(); toast('Профиль сохранён'); },
  weigh() { modal(`<h2>Записать вес</h2><label class="f">Вес сегодня, кг<input class="in" id="mw" inputmode="decimal" value="${curWeight() ? fmt(curWeight()) : ''}"></label><div class="row"><button class="btn grow" data-a="weighSave">Сохранить</button><button class="btn sec grow" data-a="mNo">Отмена</button></div>`); },
  weighSave() { if (!addWeight(num($('#mw').value))) return toast('Введите вес в килограммах, например 81,5.'); save(); closeModal(); render(); toast('Вес записан'); },
  reset() { confirmBox('Удалить профиль, программы, свои упражнения и всю историю?', 'Удалить всё', () => { S = blank(); S.skipOnb = true; save(); tab = 'today'; render(); toast('Данные удалены'); }); },
  backup() {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = 'zhelezny-plan-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Копия сохранена в загрузки');
    } catch (e) { toast('Не удалось сохранить файл'); }
  },
  mYes() { const cb = modalCb; closeModal(); if (cb) cb(); },
  mNo() { closeModal(); },

  /* программы */
  progOn(d) { S.active = d.id; S.nextDay = 0; save(); render(); toast('Программа активна. Она появится на главном экране.'); },
  progOff() { S.active = null; save(); render(); },
  progDel(d) { confirmBox('Удалить эту программу?', 'Удалить', () => { S.customProg = S.customProg.filter(p => p.id !== d.id); if (S.active === d.id) S.active = null; save(); closeSheet(); }); },
  startDay(d) { const go = () => beginDay(d.id, +d.d); if (S.cur) confirmBox('Сейчас идёт другая тренировка. Начать новую вместо неё?', 'Начать новую', go); else go(); },
  startFree() { if (S.cur) return A.resume(); startWorkout('Свободная тренировка', []); },
  resume() { stack = [{ t: 'workout' }]; render(); },

  /* редактор программ */
  edNew() { ed = { isNew: true, id: 'p' + Date.now(), n: '', d: '', custom: true, days: [{ n: 'День 1', items: [] }] }; openSheet({ t: 'editor' }); },
  edEdit(d) { const p = progBy(d.id); if (!p) return; ed = JSON.parse(JSON.stringify(p)); openSheet({ t: 'editor' }); },
  edAddDay() { ed.days.push({ n: 'День ' + (ed.days.length + 1), items: [] }); render(); },
  edDelDay(d) { ed.days.splice(+d.d, 1); render(); },
  edDelEx(d) { ed.days[+d.d].items.splice(+d.i, 1); render(); },
  edAddEx(d) { const di = +d.d; pickCb = id => { const e = exBy(id); ed.days[di].items.push({ ex: id, sets: e.sets || 3, reps: e.reps || '10–12', rest: e.rest != null ? e.rest : 90 }); }; exFilter = { g: 'all', q: '', k: 'all' }; openSheet({ t: 'picker' }); },
  edSave() {
    if (!ed.n.trim()) return toast('Дайте программе название.');
    if (!ed.days.some(d => d.items.length)) return toast('Добавьте хотя бы одно упражнение.');
    const p = { id: ed.id, n: ed.n.trim().slice(0, 60), d: (ed.d || '').slice(0, 200), custom: true, lvl: 'Моя программа', days: ed.days.map(d => ({ n: d.n.trim() || 'День', items: d.items.map(i => ({ ex: i.ex, sets: Math.max(1, Math.min(10, Math.round(num(i.sets)) || 3)), reps: String(i.reps || '10').slice(0, 14), rest: i.rest != null ? i.rest : 90 })) })) };
    const ix = S.customProg.findIndex(x => x.id === p.id);
    if (ix >= 0) S.customProg[ix] = p; else S.customProg.push(p);
    ed = null; save(); stack = stack.filter(s => s.t !== 'editor' && s.t !== 'prog'); tab = 'prog'; openSheet({ t: 'prog', id: p.id }); toast('Программа сохранена');
  },
  pick(d) { const cb = pickCb; pickCb = null; stack.pop(); if (cb) cb(d.id); save(); render(); },

  /* свои упражнения */
  exNew() { openSheet({ t: 'exform' }); },
  exEdit(d) { openSheet({ t: 'exform', id: d.id }); },
  exSave(d) {
    const n = $('#xf-n').value.trim(); if (!n) return toast('Введите название упражнения.');
    const lines = id => $('#' + id).value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12);
    const e = { id: d.id || 'c' + Date.now(), custom: true, n: n.slice(0, 70), g: $('#xf-g').value, q: $('#xf-q').value.trim().slice(0, 60), sets: Math.max(1, Math.min(10, Math.round(num($('#xf-sets').value)) || 3)), reps: $('#xf-reps').value.trim().slice(0, 14) || '10', rest: 90, st: lines('xf-st'), er: lines('xf-er').map(x => [x, '']) };
    const ix = S.customEx.findIndex(x => x.id === e.id);
    if (ix >= 0) S.customEx[ix] = e; else S.customEx.push(e);
    save(); stack.pop();
    if (pickCb && stack.length && stack[stack.length - 1].t === 'picker') return A.pick({ id: e.id });
    render(); toast('Упражнение сохранено');
  },
  exDel(d) { confirmBox('Удалить это упражнение из базы?', 'Удалить', () => { S.customEx = S.customEx.filter(e => e.id !== d.id); S.customProg.forEach(p => p.days.forEach(day => { day.items = day.items.filter(i => i.ex !== d.id); })); save(); closeSheet(); }); },
  histDel(d) { confirmBox('Удалить запись о тренировке?', 'Удалить', () => { S.history = S.history.filter(h => h.id !== d.id); save(); render(); }); },

  /* тренировка */
  wOpen(d) { S.cur.open = S.cur.open === +d.i ? -1 : +d.i; saveLocal(); render(); },
  wCheck(d) {
    const it = S.cur.items[+d.i], s = it.sets[+d.j];
    s.done = !s.done;
    if (s.done) {
      const nx = it.sets[+d.j + 1]; if (nx && !nx.done && nx.w === '' && s.w !== '') nx.w = s.w;
      const allDone = it.sets.every(x => x.done), lastOfAll = S.cur.items.every(i => i.sets.every(x => x.done));
      restEnd = lastOfAll || !restOf(it) ? 0 : Date.now() + restOf(it) * 1000;
      if (allDone) { const n = S.cur.items.findIndex(i => i.sets.some(x => !x.done)); S.cur.open = n; if (lastOfAll) toast('Все подходы сделаны. Можно завершать!'); }
    }
    save(); render();
  },
  wAddSet(d) { const it = S.cur.items[+d.i], l = it.sets[it.sets.length - 1] || { w: '', r: '' }; it.sets.push({ w: l.w, r: l.r, done: false }); save(); render(); },
  wDelSet(d) { S.cur.items[+d.i].sets.pop(); save(); render(); },
  wDelEx(d) { S.cur.items.splice(+d.i, 1); S.cur.open = Math.min(S.cur.open, S.cur.items.length - 1); save(); render(); },
  wAddEx() { pickCb = id => { S.cur.items.push(mkItem(id)); S.cur.open = S.cur.items.length - 1; }; exFilter = { g: 'all', q: '', k: 'all' }; openSheet({ t: 'picker' }); },
  wAddThis(d) { S.cur.items.push(mkItem(d.id)); S.cur.open = S.cur.items.length - 1; save(); stack = [{ t: 'workout' }]; render(); toast('Упражнение добавлено'); },
  wFinish() { finishWorkout(); },
  wCancel() { confirmBox('Отменить тренировку? Отмеченные подходы не сохранятся.', 'Отменить тренировку', () => { S.cur = null; restEnd = 0; save(); stack = []; render(); }); },
  restSkip() { restEnd = 0; render(); },
  restAdd() { restEnd += 30000; },
  doneOk() { stack = []; tab = 'today'; render(); window.scrollTo(0, 0); }
};
function applyProfile(p) {
  const first = !S.profile;
  S.profile = p;
  if (!S.weights.length) S.weights.push({ t: Date.now(), w: p.weight }); else addWeight(p.weight);
  if (first && !S.active) { S.active = recommend(p); S.nextDay = 0; }
  save();
}

const F = {
  exq(el) { exFilter.q = el.value; $('#exgrid').innerHTML = exGrid(); $('#excount').textContent = exCount(); },
  exk(el) { exFilter.k = el.value; render(); },
  pkq(el) { exFilter.q = el.value; $('#pklist').innerHTML = exRows('pick'); },
  set(el) { const d = el.dataset; S.cur.items[+d.i].sets[+d.j][d.k] = el.value.trim().slice(0, 8); S.updatedAt = Date.now(); saveLocal(); schedulePush(); },
  ed(el) { if (ed) setPath(ed, el.dataset.p, el.value); }
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]');
  if (!el) { if (ev.target.id === 'modal') closeModal(); return; }
  const fn = A[el.dataset.a]; if (fn) fn(el.dataset, el);
});
document.addEventListener('input', ev => { const el = ev.target.closest('[data-f]'); if (el && F[el.dataset.f]) F[el.dataset.f](el); });
document.addEventListener('change', ev => {
  if (ev.target.id !== 'imp' || !ev.target.files[0]) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const r = JSON.parse(fr.result);
      if (!r || r.v !== 1 || !Array.isArray(r.history)) throw 0;
      confirmBox('Заменить текущие данные данными из файла?', 'Заменить', () => { S = Object.assign(blank(), r); save(); render(); toast('Данные восстановлены'); });
    } catch (e) { toast('Это не файл копии «Железного плана».'); }
  };
  fr.readAsText(ev.target.files[0]);
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (stack.length && stack[stack.length - 1].t !== 'onb' && stack[stack.length - 1].t !== 'done') A.back(); } });

/* ====== запуск ====== */
if (!S.profile && !S.skipOnb) stack = [{ t: 'onb' }];
render();
cloudInit();
