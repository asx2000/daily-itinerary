(() => {
  'use strict';
  const KEY = 'itinerary.v1';
  const $ = id => document.getElementById(id);
  const COLORS = ['#ff7a45', '#7a5af8', '#2fb67c', '#3b8fe8', '#e0527a', '#d9a21b'];
  const TICK = '<svg viewBox="0 0 14 14"><path d="M2 7.5l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PENCIL = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);

  // state: { date, groups:[{id,name,color,collapsed}], tasks:[{id,title,priority,done,groupId}] }
  // Tasks are kept sorted by group, then by their order within the group.
  let state = store.get(KEY, null) || { date: today(), groups: [], tasks: [] };

  // ---- migrations from older versions ----
  if (state.tasks.some(t => t.time)) { // time-based version: keep chronological order
    state.tasks = state.tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.time || '99:99').localeCompare(b.t.time || '99:99') || a.i - b.i)
      .map(({ t }) => { const { time, ...rest } = t; return rest; });
  }
  if (!state.groups || !state.groups.length) {
    state.groups = [{ id: uid(), name: 'To do', color: COLORS[0], collapsed: false }];
  }
  const firstId = () => state.groups[0].id;
  function normalize() {
    const idx = new Map(state.groups.map((g, i) => [g.id, i]));
    state.tasks.forEach(t => { if (!idx.has(t.groupId)) t.groupId = firstId(); });
    state.tasks.sort((a, b) => idx.get(a.groupId) - idx.get(b.groupId)); // stable
  }
  function rollover() {
    if (state.date !== today()) state = { ...state, date: today(), tasks: state.tasks.filter(t => !t.done) };
  }
  rollover(); normalize();
  const save = () => store.set(KEY, state);

  const inGroup = g => state.tasks.filter(t => t.groupId === g.id);
  const upNext = () => state.tasks.find(t => !t.done); // first unfinished task across all groups

  // ---- render ----
  function render() {
    const total = state.tasks.length, doneN = state.tasks.filter(t => t.done).length;
    $('date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('summary').textContent = !total ? 'A fresh day.'
      : doneN === total ? `All ${total} done. Nice work!`
      : `${doneN} of ${total} done · ${total - doneN} to go`;
    $('barFill').style.width = total ? `${(doneN / total) * 100}%` : '0';
    $('hint').hidden = state.tasks.filter(t => !t.done).length < 1 || total < 2;
    $('clearAll').hidden = total === 0;

    const next = upNext();
    const box = $('groups');
    box.textContent = '';
    state.groups.forEach(g => box.append(card(g, next)));
  }

  function card(g, next) {
    const tasks = inGroup(g);
    const done = tasks.filter(t => t.done), todo = tasks.filter(t => !t.done);
    const el = document.createElement('section');
    el.className = 'card' + (g.collapsed ? ' collapsed' : '');
    el.dataset.gid = g.id;

    const top = document.createElement('div');
    top.className = 'top';
    top.onclick = () => { g.collapsed = !g.collapsed; save(); render(); };

    const ic = document.createElement('div');
    ic.className = 'ic'; ic.style.background = g.color;
    ic.textContent = (g.name.trim()[0] || '•').toUpperCase();

    const txt = document.createElement('div');
    txt.className = 'gtxt';
    const h = document.createElement('h3'); h.textContent = g.name;
    const sub = document.createElement('div'); sub.className = 'sub';
    const nx = next && next.groupId === g.id ? next : null;
    sub.textContent = !tasks.length ? 'No tasks yet'
      : g.collapsed ? (nx ? `Up next: ${nx.title}` : todo.length ? `${todo.length} to do` : 'All done ✓')
      : `${done.length} of ${tasks.length} done`;
    txt.append(h, sub);

    const edit = document.createElement('button');
    edit.className = 'gedit'; edit.innerHTML = PENCIL;
    edit.setAttribute('aria-label', `Edit group ${g.name}`);
    edit.onclick = e => { e.stopPropagation(); openGroup(g); };

    const gg = document.createElement('button');
    gg.className = 'ggrip'; gg.textContent = '⋮⋮';
    gg.setAttribute('aria-label', `Drag to reorder group ${g.name}. Arrow keys also work.`);
    gg.onclick = e => e.stopPropagation();
    gg.addEventListener('pointerdown', e => startGroupDrag(e, el));
    gg.addEventListener('keydown', e => {
      const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      const i = state.groups.indexOf(g), j = i + dir;
      if (j < 0 || j >= state.groups.length) return;
      [state.groups[i], state.groups[j]] = [state.groups[j], state.groups[i]];
      normalize(); save(); render();
      const n = document.querySelector(`.card[data-gid="${g.id}"] .ggrip`); if (n) n.focus();
    });

    top.append(gg, ic, txt, edit);
    if (g.collapsed || !tasks.length) {
      const c = document.createElement('div'); c.className = 'chev'; c.innerHTML = CHEV;
      c.style.transform = g.collapsed ? '' : 'rotate(180deg)';
      top.append(c);
    } else {
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.style.background = `conic-gradient(${g.color} ${(done.length / tasks.length) * 100}%, var(--track) 0)`;
      ring.innerHTML = `<span>${done.length}</span>`;
      top.append(ring);
    }
    el.append(top);

    const list = document.createElement('div');
    list.className = 'list'; list.dataset.gid = g.id;
    if (!tasks.length) { const e = document.createElement('div'); e.className = 'emptyg'; e.textContent = 'Nothing here yet. Add a task or drag one in.'; list.append(e); }
    done.forEach(t => list.append(row(t, false)));
    todo.forEach(t => list.append(row(t, next === t)));
    el.append(list);
    return el;
  }

  function row(t, isNext) {
    const el = document.createElement('div');
    el.dataset.id = t.id;
    el.className = 'row' + (t.done ? ' d' : isNext ? ' nx' : '');
    if (isNext) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'UP NEXT'; el.append(b); }

    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.setAttribute('aria-label', t.done ? 'Mark not done' : 'Mark done');
    chk.innerHTML = TICK;
    chk.onclick = () => {
      t.done = !t.done;
      if (!t.done) { state.tasks = state.tasks.filter(x => x !== t); state.tasks.push(t); normalize(); } // back to end of its group
      save(); render();
    };

    const label = document.createElement('div');
    label.className = 'label';
    const name = document.createElement('span');
    name.textContent = t.title; // textContent: no HTML injection
    label.append(name);
    label.onclick = () => openTask(t);
    if (t.priority) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Priority'; label.append(tag); }

    const ed = document.createElement('button');
    ed.className = 'edit'; ed.innerHTML = PENCIL; ed.setAttribute('aria-label', 'Edit task');
    ed.onclick = () => openTask(t);

    el.append(chk, label, ed);

    if (t.done) {
      const del = document.createElement('button');
      del.className = 'del'; del.setAttribute('aria-label', 'Delete task'); del.textContent = '×';
      del.onclick = () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); render(); };
      el.append(del);
    } else {
      const grip = document.createElement('button');
      grip.className = 'grip';
      grip.setAttribute('aria-label', 'Drag to reorder or move to another group. Arrow keys also work.');
      grip.textContent = '⋮⋮';
      grip.addEventListener('pointerdown', e => startDrag(e, el));
      grip.addEventListener('keydown', e => {
        const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (dir) { e.preventDefault(); moveBy(t, dir); }
      });
      el.append(grip);
    }
    return el;
  }

  // keyboard: move within the group's unfinished tasks
  function moveBy(t, dir) {
    const peers = state.tasks.filter(x => x.groupId === t.groupId && !x.done);
    const i = peers.indexOf(t), j = peers[i + dir];
    if (!j) return;
    const a = state.tasks.indexOf(t), b = state.tasks.indexOf(j);
    [state.tasks[a], state.tasks[b]] = [state.tasks[b], state.tasks[a]];
    save(); render();
    const g = document.querySelector(`[data-id="${t.id}"] .grip`); if (g) g.focus();
  }

  // ---- drag between and within groups (pointer events: touch, pen, mouse) ----
  // The dragged row floats under the finger (position: fixed) and never moves in the DOM,
  // so pointer tracking can't be lost. A dashed placeholder marks where it will land.
  function startDrag(e, el) {
    if (e.button > 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const cards = [...document.querySelectorAll('#groups .card')];
    const rect = el.getBoundingClientRect();
    const grabY = e.clientY - rect.top;
    let lastY = e.clientY, raf = 0, over = null;

    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.style.height = rect.height + 'px';
    el.before(ph);
    el.classList.add('lift');
    Object.assign(el.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: '0' });
    document.body.classList.add('dragging');

    function update(y) {
      el.style.top = (y - grabY) + 'px';
      for (const c of cards) { const r = c.getBoundingClientRect(); if (y >= r.top && y <= r.bottom) { over = c; break; } }
      const target = over || ph.closest('.card');

      // collapsed groups open while a task hovers over them
      cards.forEach(c => c.classList.toggle('peek', c.classList.contains('collapsed') && (c === target || c === ph.closest('.card'))));

      // slot the placeholder among the target group's unfinished tasks, by finger position
      const list = target.querySelector('.list');
      const rows = [...list.children].filter(c => c.classList.contains('row') && !c.classList.contains('d') && c !== el);
      const ref = rows.find(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; }) || null;
      if (ph.parentElement !== list || ph.nextElementSibling !== ref) list.insertBefore(ph, ref);
    }

    const loop = () => { // auto-scroll near the screen edges
      const sy = scrollY;
      if (lastY < 90) scrollBy(0, -10); else if (lastY > innerHeight - 110) scrollBy(0, 10);
      if (scrollY !== sy) update(lastY);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onMove = ev => { lastY = ev.clientY; update(lastY); };
    const end = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging');

      // rebuild state from where the placeholder ended up
      const byId = new Map(state.tasks.map(t => [t.id, t]));
      const dragged = byId.get(el.dataset.id);
      const dest = ph.closest('.card');
      const next = [];
      document.querySelectorAll('#groups .card').forEach(c => {
        c.querySelectorAll('.list > .row, .list > .ph').forEach(r => {
          const t = r === ph ? dragged : r === el ? null : byId.get(r.dataset.id);
          if (t) { t.groupId = c.dataset.gid; next.push(t); }
        });
      });
      state.tasks = next;
      const g = dest && state.groups.find(x => x.id === dest.dataset.gid);
      if (g) g.collapsed = false; // reveal where it landed
      normalize(); save(); render();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // ---- reorder groups by dragging their handle ----
  // Cards shrink to one line while dragging so long groups are easy to move.
  function startGroupDrag(e, card) {
    if (e.button > 0) return;
    e.preventDefault();
    const grip = e.currentTarget, box = $('groups');
    grip.setPointerCapture(e.pointerId);
    box.classList.add('reordering');
    document.body.classList.add('dragging');
    const rect = card.getBoundingClientRect(); // measured after shrinking
    const grabY = e.clientY - rect.top;
    let lastY = e.clientY, raf = 0;

    const ph = document.createElement('div');
    ph.className = 'ph card-ph';
    ph.style.height = rect.height + 'px';
    card.before(ph);
    card.classList.add('lift');
    Object.assign(card.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: '0', zIndex: 50 });

    function update(y) {
      card.style.top = (y - grabY) + 'px';
      const others = [...box.children].filter(c => c.classList.contains('card') && c !== card);
      const ref = others.find(c => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; }) || null;
      if (ph.nextElementSibling !== ref) box.insertBefore(ph, ref);
    }
    const loop = () => {
      const sy = scrollY;
      if (lastY < 90) scrollBy(0, -10); else if (lastY > innerHeight - 110) scrollBy(0, 10);
      if (scrollY !== sy) update(lastY);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onMove = ev => { lastY = ev.clientY; update(lastY); };
    const end = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging');
      const byId = new Map(state.groups.map(g => [g.id, g]));
      const order = [];
      [...box.children].forEach(c => {
        if (c === ph) order.push(byId.get(card.dataset.gid));
        else if (c !== card && c.dataset.gid) order.push(byId.get(c.dataset.gid));
      });
      state.groups = order.filter(Boolean);
      normalize(); save(); render();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // ---- task dialog ----
  const dlg = $('addDialog');
  let editing = null, lastGroup = null;
  function openTask(task, groupId) {
    editing = task || null;
    $('dlgTitle').textContent = editing ? 'Edit task' : 'New task';
    $('save').textContent = editing ? 'Save' : 'Add';
    $('del').hidden = !editing;
    $('title').value = editing ? editing.title : '';
    $('priority').checked = editing ? !!editing.priority : false;
    const sel = $('group');
    sel.textContent = '';
    state.groups.forEach(g => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.name; sel.append(o); });
    const want = editing ? editing.groupId : (groupId || (state.groups.some(g => g.id === lastGroup) ? lastGroup : firstId()));
    sel.value = want;
    dlg.showModal(); $('title').focus();
  }
  $('openAdd').onclick = () => openTask(null);
  $('cancel').onclick = () => dlg.close();
  $('del').onclick = () => {
    if (editing) state.tasks = state.tasks.filter(x => x.id !== editing.id);
    dlg.close(); save(); render();
  };
  $('addForm').onsubmit = () => {
    const title = $('title').value.trim();
    if (!title) return;
    const gid = $('group').value;
    lastGroup = gid;
    if (editing) {
      editing.title = title; editing.priority = $('priority').checked;
      if (editing.groupId !== gid) { // moved via the dialog: goes to the end of that group
        state.tasks = state.tasks.filter(x => x !== editing);
        editing.groupId = gid; state.tasks.push(editing);
      }
    } else {
      state.tasks.push({ id: uid(), title, priority: $('priority').checked, done: false, groupId: gid });
    }
    const g = state.groups.find(x => x.id === gid); if (g) g.collapsed = false;
    normalize(); save(); render();
  };

  // ---- group dialog ----
  const gdlg = $('groupDialog');
  let gEditing = null, gColor = COLORS[0];
  function paintSwatches() {
    const box = $('gColors'); box.textContent = '';
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sw' + (c === gColor ? ' on' : ''); b.style.background = c;
      b.setAttribute('aria-label', 'Colour ' + c);
      b.onclick = () => { gColor = c; paintSwatches(); };
      box.append(b);
    });
  }
  function openGroup(g) {
    gEditing = g || null;
    gColor = g ? g.color : COLORS[state.groups.length % COLORS.length];
    $('gDlgTitle').textContent = g ? 'Edit group' : 'New group';
    $('gSave').textContent = g ? 'Save' : 'Add';
    $('gName').value = g ? g.name : '';
    $('gDel').hidden = !g || state.groups.length < 2;
    $('gMove').hidden = !g || state.groups.length < 2;
    paintSwatches();
    gdlg.showModal(); $('gName').focus();
  }
  $('addGroup').onclick = () => openGroup(null);
  $('gCancel').onclick = () => gdlg.close();
  $('groupForm').onsubmit = () => {
    const name = $('gName').value.trim();
    if (!name) return;
    if (gEditing) { gEditing.name = name; gEditing.color = gColor; }
    else state.groups.push({ id: uid(), name, color: gColor, collapsed: false });
    save(); render();
  };
  function moveGroup(dir) {
    const i = state.groups.indexOf(gEditing), j = i + dir;
    if (j < 0 || j >= state.groups.length) return;
    [state.groups[i], state.groups[j]] = [state.groups[j], state.groups[i]];
    normalize(); save(); render(); gdlg.close();
  }
  $('gUp').onclick = () => moveGroup(-1);
  $('gDown').onclick = () => moveGroup(1);
  $('gDel').onclick = () => {
    const n = inGroup(gEditing).length;
    const msg = n ? `Delete "${gEditing.name}"? Its ${n} task${n > 1 ? 's' : ''} will move to another group.` : `Delete "${gEditing.name}"?`;
    if (!confirm(msg)) return;
    const i = state.groups.indexOf(gEditing);
    const heir = state.groups[i === 0 ? 1 : i - 1];
    state.tasks.forEach(t => { if (t.groupId === gEditing.id) t.groupId = heir.id; });
    state.groups.splice(i, 1);
    normalize(); save(); render(); gdlg.close();
  };

  $('clearAll').onclick = () => {
    if (confirm('Delete all tasks? Your groups stay. This cannot be undone.')) { state.tasks = []; save(); render(); }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    rollover(); normalize(); save(); render();
  });

  save(); render();

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
