(() => {
  'use strict';
  const KEY = 'itinerary.v1';
  const $ = id => document.getElementById(id);
  const TICK = '<svg viewBox="0 0 14 14"><path d="M2 7.5l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);

  // state.tasks is the display order. Unfinished tasks are shown in this order;
  // the first unfinished task is "Up next".
  let state = store.get(KEY, null) || { date: today(), tasks: [] };

  // One-time migration from the older time-based version: keep the old
  // chronological order, then drop the time field.
  if (state.tasks.some(t => t.time)) {
    state.tasks = state.tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.time || '99:99').localeCompare(b.t.time || '99:99') || a.i - b.i)
      .map(({ t }) => { const { time, ...rest } = t; return rest; });
  }

  function rollover() {
    if (state.date !== today()) state = { date: today(), tasks: state.tasks.filter(t => !t.done) };
  }
  rollover();
  const save = () => store.set(KEY, state);

  function render() {
    const todo = state.tasks.filter(t => !t.done);
    const done = state.tasks.filter(t => t.done);

    $('date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const total = state.tasks.length;
    $('summary').textContent = !total ? 'A fresh day.'
      : !todo.length ? `All ${total} done. Nice work!`
      : `${done.length} of ${total} done · ${todo.length} to go`;
    $('barFill').style.width = total ? `${(done.length / total) * 100}%` : '0';

    const box = $('todo');
    box.textContent = '';
    todo.forEach((t, i) => box.append(row(t, i)));
    $('hint').hidden = todo.length < 2;
    $('empty').hidden = total > 0;
    $('clearAll').hidden = total === 0;

    $('doneWrap').hidden = !done.length;
    $('doneCount').textContent = done.length;
    const dbox = $('done');
    dbox.textContent = '';
    done.forEach(t => dbox.append(row(t, -1)));
  }

  function row(t, i) {
    const el = document.createElement('div');
    el.dataset.id = t.id;
    el.className = 'row' + (t.done ? ' d' : i === 0 ? ' nx' : ' rest');

    if (i === 0) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'UP NEXT'; el.append(b); }

    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.setAttribute('aria-label', t.done ? 'Mark not done' : 'Mark done');
    chk.innerHTML = TICK;
    chk.onclick = () => {
      t.done = !t.done;
      // A task brought back goes to the end of the to-do list.
      if (!t.done) { state.tasks = state.tasks.filter(x => x !== t); state.tasks.push(t); }
      save(); render();
    };

    if (!t.done && i > 0) { const n = document.createElement('div'); n.className = 'num'; n.textContent = i + 1; el.append(n); }
    el.append(chk);

    const label = document.createElement('div');
    label.className = 'label';
    const name = document.createElement('span');
    name.textContent = t.title; // textContent: no HTML injection
    name.title = 'Tap to edit';
    name.onclick = () => openDialog(t);
    label.append(name);
    if (t.priority) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Priority'; label.append(tag); }
    el.append(label);

    if (t.done) {
      const del = document.createElement('button');
      del.className = 'del';
      del.setAttribute('aria-label', 'Delete task');
      del.textContent = '×';
      del.onclick = () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); render(); };
      el.append(del);
    } else {
      const grip = document.createElement('button');
      grip.className = 'grip';
      grip.setAttribute('aria-label', 'Drag to reorder. Arrow keys also work.');
      grip.textContent = '⋮⋮';
      grip.addEventListener('pointerdown', e => startDrag(e, el));
      grip.addEventListener('keydown', e => {
        const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (dir) { e.preventDefault(); moveBy(t.id, dir); }
      });
      el.append(grip);
    }
    return el;
  }

  function moveBy(id, dir) {
    const todo = state.tasks.filter(t => !t.done);
    const i = todo.findIndex(t => t.id === id), j = i + dir;
    if (j < 0 || j >= todo.length) return;
    [todo[i], todo[j]] = [todo[j], todo[i]];
    state.tasks = [...todo, ...state.tasks.filter(t => t.done)];
    save(); render();
    const g = document.querySelector(`[data-id="${id}"] .grip`); if (g) g.focus();
  }

  // ---- Drag to reorder (pointer events: works with touch, pen and mouse) ----
  function startDrag(e, el) {
    if (e.button > 0) return;
    e.preventDefault();
    const list = $('todo');
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    let startY = e.clientY;
    el.classList.add('lift');
    el.style.transition = 'box-shadow .2s';
    document.body.classList.add('dragging');

    const onMove = ev => {
      let dy = ev.clientY - startY;
      el.style.transform = `translateY(${dy}px) rotate(-1deg) scale(1.03)`;
      // Swap with neighbours as the dragged card crosses their centres.
      for (;;) {
        const r = el.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const prev = el.previousElementSibling, next = el.nextElementSibling;
        let swap = null, before = null;
        if (next) { const nr = next.getBoundingClientRect(); if (c > nr.top + nr.height / 2) { swap = next; before = true; } }
        if (!swap && prev) { const pr = prev.getBoundingClientRect(); if (c < pr.top + pr.height / 2) { swap = prev; before = false; } }
        if (!swap) break;
        const topBefore = el.getBoundingClientRect().top;
        if (before) list.insertBefore(swap, el); else list.insertBefore(el, swap);
        // keep the card under the finger after its natural position changed
        startY += el.getBoundingClientRect().top - topBefore;
        dy = ev.clientY - startY;
        el.style.transform = `translateY(${dy}px) rotate(-1deg) scale(1.03)`;
      }
      // auto-scroll near screen edges
      if (ev.clientY < 90) scrollBy(0, -12); else if (ev.clientY > innerHeight - 110) scrollBy(0, 12);
    };
    const end = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging');
      const order = [...list.children].map(c => c.dataset.id);
      const byId = new Map(state.tasks.map(t => [t.id, t]));
      state.tasks = [...order.map(id => byId.get(id)), ...state.tasks.filter(t => t.done)];
      save(); render();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // ---- Add dialog ----
  const dlg = $('addDialog');
  let editing = null; // the task being edited, or null when adding
  function openDialog(task) {
    editing = task || null;
    $('dlgTitle').textContent = editing ? 'Edit task' : 'New task';
    $('save').textContent = editing ? 'Save' : 'Add';
    $('del').hidden = !editing;
    $('title').value = editing ? editing.title : '';
    $('priority').checked = editing ? !!editing.priority : false;
    dlg.showModal(); $('title').focus();
  }
  $('openAdd').onclick = () => openDialog(null);
  $('cancel').onclick = () => dlg.close();
  $('del').onclick = () => {
    if (editing) state.tasks = state.tasks.filter(x => x.id !== editing.id);
    dlg.close(); save(); render();
  };
  $('addForm').onsubmit = () => {
    const title = $('title').value.trim();
    if (!title) return;
    if (editing) {
      editing.title = title; editing.priority = $('priority').checked;
    } else {
      state.tasks.splice(state.tasks.filter(t => !t.done).length, 0, { id: uid(), title, priority: $('priority').checked, done: false });
    }
    save(); render();
  };
  $('clearAll').onclick = () => {
    if (confirm('Delete all tasks? This cannot be undone.')) { state.tasks = []; save(); render(); }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    rollover(); save(); render();
  });

  save(); render();

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
