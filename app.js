(() => {
  'use strict';
  const KEY = 'itinerary.v1';
  const NAME_KEY = 'itinerary.name';
  const $ = id => document.getElementById(id);
  const TICK = '<svg viewBox="0 0 14 14"><path d="M2 7.5l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SECTIONS = [
    { id: 'morning', label: 'Morning', test: m => m < 12 * 60 },
    { id: 'afternoon', label: 'Afternoon', test: m => m < 17 * 60 },
    { id: 'evening', label: 'Evening', test: () => true },
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // State is per day: { date, tasks:[{id,title,time,priority,done}] }
  let state = store.get(KEY, null);
  if (!state) {
    state = { date: today(), tasks: [] };
  }
  // New day: carry over unfinished tasks, drop finished ones.
  if (state.date !== today()) {
    state = { date: today(), tasks: state.tasks.filter(t => !t.done).map(t => ({ ...t })) };
  }
  const save = () => store.set(KEY, state);

  function greeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = store.get(NAME_KEY, '');
    return name ? `${g},<br>${name.replace(/[<>&]/g, '')}!` : `${g}!`;
  }

  function render() {
    const tasks = [...state.tasks].sort((a, b) => mins(a.time) - mins(b.time));
    const done = tasks.filter(t => t.done).length;
    $('greeting').innerHTML = greeting();
    $('summary').textContent = tasks.length
      ? (done === tasks.length ? `All ${tasks.length} tasks done. Nice work!` : `${done} of ${tasks.length} tasks done — keep going`)
      : 'A fresh day. Add your first task.';
    $('barFill').style.width = tasks.length ? `${(done / tasks.length) * 100}%` : '0';
    $('empty').hidden = tasks.length > 0;

    const list = $('list');
    list.textContent = '';
    for (const s of SECTIONS) {
      const prev = SECTIONS[SECTIONS.indexOf(s) - 1];
      const items = tasks.filter(t => s.test(mins(t.time)) && !(prev && prev.test(mins(t.time))));
      if (!items.length) continue;
      const head = document.createElement('div');
      head.className = 'sec';
      head.innerHTML = `<span>${s.label}</span><span>${items.filter(t => t.done).length}/${items.length}</span>`;
      list.append(head);
      for (const t of items) list.append(row(t));
    }
  }

  function row(t) {
    const el = document.createElement('div');
    el.className = 'row' + (t.done ? ' d' : '');

    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.setAttribute('aria-label', t.done ? 'Mark not done' : 'Mark done');
    chk.innerHTML = TICK;
    chk.onclick = () => { t.done = !t.done; save(); render(); };

    const label = document.createElement('div');
    label.className = 'label';
    const name = document.createElement('span');
    name.textContent = t.title; // textContent: no HTML injection
    label.append(name);
    if (t.priority) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Priority'; label.append(tag); }

    const time = document.createElement('time');
    time.textContent = t.time;

    const del = document.createElement('button');
    del.className = 'del';
    del.setAttribute('aria-label', 'Delete task');
    del.textContent = '×';
    del.onclick = () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); render(); };

    el.append(chk, label, time, del);
    return el;
  }

  // Add dialog
  const dlg = $('addDialog');
  $('openAdd').onclick = () => {
    const d = new Date();
    $('time').value = `${String(d.getHours()).padStart(2, '0')}:${String(Math.ceil(d.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`;
    $('title').value = ''; $('priority').checked = false;
    dlg.showModal(); $('title').focus();
  };
  $('cancel').onclick = () => dlg.close();
  $('addForm').onsubmit = () => {
    const title = $('title').value.trim();
    if (!title) return;
    state.tasks.push({ id: uid(), title, time: $('time').value || '09:00', priority: $('priority').checked, done: false });
    save(); render();
  };

  // Tap greeting to set name
  $('greeting').onclick = () => {
    const n = prompt('Your name?', store.get(NAME_KEY, ''));
    if (n !== null) { store.set(NAME_KEY, n.trim().slice(0, 30)); render(); }
  };

  // Re-render when the app returns to the foreground (greeting/day rollover)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.date !== today()) state = { date: today(), tasks: state.tasks.filter(t => !t.done) };
    save(); render();
  });

  save(); render();

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
