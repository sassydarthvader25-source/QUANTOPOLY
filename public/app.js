// Client: renders server state, sends intents. No game rules live here;
// Quantum is used only to preview what a gate would do.
(() => {
  const Q = Quantum, { TILES, GATES, CONFIG } = Board;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const socket = io();
  const PCOL = ['#14213D', '#B4361F', '#0E7490', '#8A6D0B', '#6D28D9', '#BE185D', '#166534', '#9A3412'];
  const money = n => '$' + n;
  const ket = l => '|' + (l === '-' ? '−' : l) + '⟩';

  let myId = null, lobby = null, S = null, prevHand = '';
  const ui = { compose: null, sel: [], recycle: false, confirmEnd: false, confirmLeave: false };

  // ---------- session ----------
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem('qm') || 'null'); } catch { return null; } },
    set(o) { try { sessionStorage.setItem('qm', JSON.stringify(o)); } catch {} },
    clear() { try { sessionStorage.removeItem('qm'); } catch {} },
  };
  const saved = store.get();
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('#code').value = urlRoom.toUpperCase();
  if (saved && saved.name) $('#name').value = saved.name;

  let toastTimer;
  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  socket.on('connect', () => { if (saved && saved.code && saved.token) socket.emit('join', { code: saved.code, token: saved.token, name: saved.name }); });
  socket.on('err', m => { if (m === 'Room not found') store.clear(); toast(m); });
  socket.on('joined', j => {
    myId = j.id; store.set({ code: j.code, token: j.token, name: $('#name').value || (saved && saved.name) || 'Player' });
    $('#entry').classList.add('hidden');
  });
  socket.on('lobby', l => {
    lobby = l;
    const showLobby = !l.started && myId;
    $('#lobby').classList.toggle('hidden', !showLobby);
    $('#roomcode').textContent = l.code;
    $('#plist').innerHTML = l.players.map(p =>
      `<li class="${p.id === myId ? 'me' : ''}"><span>${esc(p.name)}</span>${p.id === l.hostId ? '<span class="dim">host</span>' : ''}${p.online ? '' : '<span class="dim">offline</span>'}</li>`).join('');
    const host = l.hostId === myId;
    $('#start').classList.toggle('hidden', !host);
    $('#targetrow').classList.toggle('hidden', !host);
    $('#start').disabled = l.players.length < 2;
    $('#waiting').classList.toggle('hidden', host);
    if (S) render();
  });
  socket.on('state', s => { S = s; render(); });
  socket.on('left', () => {
    store.clear(); myId = null; lobby = null; S = null; prevHand = '';
    Object.assign(ui, { compose: null, sel: [], recycle: false, confirmEnd: false, confirmLeave: false });
    for (const id of ['#lobby', '#game', '#over']) $(id).classList.add('hidden');
    $('#entry').classList.remove('hidden'); $('#code').value = '';
    history.replaceState(null, '', location.pathname);
  });

  $('#create').onclick = () => socket.emit('create', { name: $('#name').value });
  $('#join').onclick = () => socket.emit('join', { code: $('#code').value, name: $('#name').value });
  $('#leave').onclick = () => socket.emit('leave');
  $('#start').onclick = () => socket.emit('start', { target: $('#target').value });
  $('#copylink').onclick = async () => {
    const url = location.origin + '/?room=' + lobby.code;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { toast(url); }
  };

  const send = a => socket.emit('action', a);

  // ---------- pieces ----------
  const ANG = { '0': 0, '+': 90, '1': 180, '-': 270 }; // needle = Bloch vector on the X-Z plane, clockwise from up
  function chip(l, { idx = null, sel = false, badge = '', fresh = false, mini = false, attr = '', active = false } = {}) {
    const inner = `<svg viewBox="-30 -30 60 60" aria-hidden="true"><circle r="26" class="ring"/>
      <line class="axis" x1="-26" x2="26"/><line class="axis" y1="-26" y2="26"/>
      <g class="needle" transform="rotate(${ANG[l]})"><line y1="2" y2="-17"/><path d="M0 -24 L-6 -14 L6 -14Z"/></g><circle r="3" class="hub"/></svg>
      <span class="ket">${ket(l)}</span>${badge ? `<span class="badge">${badge}</span>` : ''}`;
    const cls = `chip${sel ? ' sel' : ''}${fresh ? ' fresh' : ''}${mini ? ' mini' : ''}`;
    return active
      ? `<button class="${cls}" ${attr} aria-pressed="${sel}" aria-label="state card ${ket(l)}">${inner}</button>`
      : `<div class="${cls}" role="img" aria-label="state card ${ket(l)}">${inner}</div>`;
  }
  const gtag = g => `<span class="tag">${g}</span>`;
  const gstyle = g => `style="--gc:${GATES[g].color}"`;
  const tileOf = p => TILES[p.pos];
  const dotHTML = (i, name) => `<span class="dot" style="background:${PCOL[i % 8]}">${esc((name || '?')[0].toUpperCase())}</span>`;

  function gridPos(id) {
    if (id <= 10) return [11, 11 - id];
    if (id <= 20) return [11 - (id - 10), 1];
    if (id <= 30) return [1, 1 + (id - 20)];
    return [1 + (id - 30), 11];
  }

  // ---------- board ----------
  function boardHTML(s) {
    const at = {};
    s.order.forEach((id, i) => { (at[s.players[id].pos] ||= []).push(i); });
    const cur = s.players[s.currentPlayer];
    let h = TILES.map(t => {
      const [r, c] = gridPos(t.id);
      const own = s.owners[t.id];
      const band = t.gate ? GATES[t.gate].color : 'var(--dim)';
      const corner = [0, 10, 20, 30].includes(t.id);
      const ownStyle = own !== undefined ? `--own:${PCOL[s.order.indexOf(own) % 8]};` : '';
      const tip = t.name + (t.gate ? ` (${GATES[t.gate].name})` : '') + (own !== undefined ? `, owned by ${s.players[own].name}` : '');
      const pips = (at[t.id] || []).map(i => `<span class="pip" style="background:${PCOL[i % 8]}" title="${esc(s.players[s.order[i]].name)}">${esc(s.players[s.order[i]].name[0].toUpperCase())}</span>`).join('');
      return `<div class="tile${corner ? ' corner' : ''}${own !== undefined ? ' owned' : ''}${cur.pos === t.id ? ' here' : ''}" style="grid-area:${r}/${c};${ownStyle}" title="${esc(tip)}" aria-label="${esc(tip)}">
        <span class="band" style="background:${band}"></span><span class="id">${t.id}</span>
        <span class="sym${t.sym.length > 2 ? ' long' : ''}">${esc(t.sym)}</span>
        <span class="nm">${esc(t.gate && t.gate !== 'CNOT' ? GATES[t.gate].name : t.name)}</span><span class="pips">${pips}</span></div>`;
    }).join('');
    h += centerHTML(s);
    return h;
  }

  function centerHTML(s) {
    const d = s.lastRoll ? s.lastRoll.dice : null;
    const die = n => '⚀⚁⚂⚃⚄⚅'[n - 1];
    const last = s.log.length ? s.log[s.log.length - 1].msg : '';
    return `<div id="center"><div class="oval"><h1>Quantopoly</h1><div class="sub">Round ${s.round}</div>
      ${d ? `<div class="dice" aria-label="Dice ${d[0]} and ${d[1]}"><span class="die">${die(d[0])}</span><span class="die">${die(d[1])}</span></div>` : ''}
      <div class="last">${esc(last)}</div></div></div>`;
  }

  function cardBox(s) {
    const lc = s.lastCard; if (!lc) return '';
    let t = `<b>${lc.deck === 'chance' ? 'Chance' : 'Community chest'}</b> ${esc(lc.text)}`;
    if (lc.result) t += ` <span class="${lc.result === 'right' ? 'good' : 'bad'}">${lc.result === 'right' ? 'Correct.' : 'Wrong.'}</span> ${esc(lc.why)}`;
    return `<div class="cardbox">${t}</div>`;
  }

  // ---------- side ----------
  function turnPanel(s, me, mine) {
    const cur = s.players[s.currentPlayer];
    let h = `<section class="panel turn">${s.pending && s.pending.type === 'quiz' ? '' : cardBox(s)}<h2>${mine ? 'Your turn' : `${esc(cur.name)} is playing`}<span class="note">Round ${s.round}, ${money(me.cash)}</span></h2>`;

    if (s.pending && s.pending.type === 'quiz') {
      const p = s.pending, can = p.pid === myId;
      h += `<div class="stack quiz"><div><b>${p.level === 'hard' ? 'Hard question' : 'Easy question'}</b> <span class="note">${p.level === 'hard' ? `Correct earns ${money(CONFIG.chanceReward)}` : `Wrong costs ${money(CONFIG.chancePenalty)}`}</span></div>
        <div>${esc(p.q)}</div>
        ${p.options.map((o, i) => can ? `<button data-act="answer" data-i="${i}">${esc(o)}</button>` : `<div class="note">${esc(o)}</div>`).join('')}</div></section>`;
      return h;
    }
    if (!mine) { return h + `<p class="note">${esc(cur.name)} is on ${esc(tileOf(cur).name)}.</p></section>`; }

    if (s.phase === 'roll') {
      if (me.inJail) {
        h += `<p class="note">You are in jail. Roll doubles to leave, or pay ${money(CONFIG.jailFine)}. Attempt ${me.jailTries + 1} of ${CONFIG.jailTries}.</p>
          <div class="row"><button class="primary" data-act="roll">Roll for doubles</button><button data-act="payJail" ${me.cash < CONFIG.jailFine ? 'disabled' : ''}>Pay ${money(CONFIG.jailFine)} and leave</button></div>`;
      } else h += `<div class="row"><button class="primary" data-act="roll">Roll dice</button></div>`;
      return h + '</section>';
    }

    // act phase
    const t = tileOf(me), limit = CONFIG.gatesPerTurn > 0 && s.gatesUsed >= CONFIG.gatesPerTurn;
    h += `<p>You are on <b>${esc(t.name)}</b>.${limit ? ' <span class="note">Gate limit reached this turn.</span>' : ''}</p><div class="stack">`;
    if (t.type === 'gate') {
      const g = GATES[t.gate], own = s.owners[t.id], foreign = own !== undefined && own !== myId;
      const allowed = s.tilesAllowed[myId], owned = s.tilesOwned[myId], next = CONFIG.claimEntangled * (owned + 1);
      h += `<button class="gbtn" ${gstyle(t.gate)} data-act="buyToken" ${me.cash < g.price ? 'disabled' : ''}>${gtag(t.gate)} Buy a ${esc(g.name)} token for ${money(g.price)}${foreign ? ` (paid to ${esc(s.players[own].name)})` : ''}</button>`;
      if (own === undefined) {
        const early = s.round < CONFIG.ownershipFromRound;
        h += `<button data-act="claim" ${!early && owned < allowed && me.cash >= CONFIG.claimPrice ? '' : 'disabled'}>Own this shop for ${money(CONFIG.claimPrice)}</button>`;
        h += early ? `<span class="note">Round 1 is for visiting. Shops can be owned from round ${CONFIG.ownershipFromRound}.</span>`
          : owned >= allowed ? `<span class="note">Owning a shop needs ${next} entangled states. You have ${me.bell.length}.</span>`
          : me.cash < CONFIG.claimPrice ? `<span class="note">You need ${money(CONFIG.claimPrice)} to own a shop.</span>` : '';
      }
      else if (own === myId) h += `<span class="note">You own this shop. Other players pay you ${money(g.price)} for a token here.</span>`;
    } else if (t.type === 'stateshop') {
      h += `<div class="note">State shop. Buy a state card.</div>
        <button data-act="buyState" data-mode="random" ${me.cash < CONFIG.stateRandomPrice ? 'disabled' : ''}>Random card for ${money(CONFIG.stateRandomPrice)}</button>
        <div class="note">Or choose the exact card for ${money(CONFIG.stateChoosePrice)}</div>
        <div class="row">${Q.LABELS.map(l => `<button data-act="buyState" data-mode="choose" data-label="${l}" ${me.cash < CONFIG.stateChoosePrice ? 'disabled' : ''}>${ket(l)}</button>`).join('')}</div>`;
    } else if (t.type === 'market' && s.market && s.market.pid === myId) {
      h += `<div class="note">Open market. Buy one of three gate tokens.</div><div class="row">` +
        s.market.offers.map((g, i) => `<button class="gbtn" ${gstyle(g)} data-act="marketBuy" data-i="${i}" ${s.market.bought || me.cash < GATES[g].price ? 'disabled' : ''}>${gtag(g)} ${money(GATES[g].price)}</button>`).join('') + '</div>' +
        `<button data-act="recycleToggle" ${me.cash < CONFIG.recyclePrice || !me.qubits.length ? 'disabled' : ''} aria-pressed="${ui.recycle}">${ui.recycle ? 'Pick a state card below to recycle…' : `Recycle a state card for ${money(CONFIG.recyclePrice)}`}</button>`;
    }
    const toks = Object.keys(GATES).filter(g => me.tokens[g] > 0);
    if (toks.length) h += `<div class="note">Your gate tokens (each is used once)</div><div class="row">` +
      toks.map(g => `<button class="gbtn" ${gstyle(g)} data-act="use" data-gate="${g}" ${limit ? 'disabled' : ''}>${gtag(g)} Play${me.tokens[g] > 1 ? ' ×' + me.tokens[g] : ''}</button>`).join('') + '</div>';
    h += `<button class="primary" data-act="end">End turn</button></div></section>`;
    return h;
  }

  function composePanel(s, me) {
    const { gate } = ui.compose, def = GATES[gate];
    const need = def.kind === 'one' ? 'Pick one of your state cards.' : (gate === 'CNOT' ? 'Pick the control card, then the target card.' : 'Pick two state cards.');
    let ready = false, prev = '';
    if (def.kind === 'one' && ui.sel.length === 1) {
      const l = me.qubits[ui.sel[0]]; prev = `<div class="preview">${ket(l)} → ${ket(Q.applySingle(gate, l))}</div>`; ready = true;
    } else if (def.kind === 'two' && ui.sel.length === 2) {
      const la = me.qubits[ui.sel[0]], lb = me.qubits[ui.sel[1]], r = Q.applyTwo(gate, la, lb);
      ready = true;
      if (r.entangled) {
        prev = `<div class="preview ent">${ket(la)}${ket(lb)} → entangled: <b>${esc(r.name)}</b> ${esc(r.text)}${r.bell ? '' : ' <span class="note">(a rotated Bell state)</span>'}</div>`;
      } else {
        const steps = Q.hTokensNeeded(gate, la, lb), alt = Q.hTokensNeeded(gate, lb, la);
        const fix = steps.map(x => `an H token on the ${x}`).join(' and ');
        prev = `<div class="preview">${ket(la)}${ket(lb)} → ${ket(r.a)}${ket(r.b)}. No entanglement, and the ${gate} token would be spent.</div>
          <p class="note" style="margin:0">Needs ${fix} first.${alt.length < steps.length ? ' Swapping control and target would need fewer H tokens.' : ''}</p>`;
      }
    }
    return `<section class="panel compose" style="--gc:${def.color};border-color:${def.color};border-width:2px">
      <h2><span>${gtag(gate)} ${gate.toLowerCase() !== def.name.toLowerCase() ? esc(def.name) : ''}</span></h2>
      <p class="note" style="margin:0">${esc(def.blurb)}</p>
      <p style="margin:0">${need}</p>${prev}
      <div class="row"><button class="primary" data-act="confirm" ${ready ? '' : 'disabled'}>Apply ${gate}</button><button data-act="cancel">Cancel</button></div></section>`;
  }

  function handPanel(s, me, mine) {
    const sel = !!ui.compose || ui.recycle;
    const def = ui.compose && GATES[ui.compose.gate];
    const chips = me.qubits.length
      ? me.qubits.map((l, i) => {
          const k = ui.sel.indexOf(i);
          const badge = k >= 0 && def && def.kind === 'two' ? (ui.compose.gate === 'CNOT' ? (k === 0 ? 'C' : 'T') : k + 1) : '';
          return chip(l, { idx: i, sel: k >= 0, badge, fresh: prevHand !== '' && prevHand.split(',')[i] !== l, active: sel && mine, attr: `data-q="${i}"` });
        }).join('')
      : '<span class="note">No state cards left. Pass Go for 2 more.</span>';
    const toks = Object.keys(GATES).filter(g => me.tokens[g] > 0)
      .map(g => `<span class="tokcount" style="--gc:${GATES[g].color}">${gtag(g)} ×${me.tokens[g]}</span>`).join(' ');
    const bells = me.bell.length ? `<div class="bells">${me.bell.map(b => bellHTML(b)).join('')}</div>` : '<span class="note">None yet.</span>';
    const owned = s.tilesOwned[myId], next = CONFIG.claimEntangled * (owned + 1);
    return `<section class="panel"><h2>Your state cards</h2><div class="chips">${chips}</div>
      <p class="note" style="margin:0">Needle up is |0⟩, down is |1⟩, right is |+⟩, left is |−⟩.</p>
      <h2>Your gate tokens</h2>${toks ? `<div class="row">${toks}</div>` : '<span class="note">None. Buy them on gate tiles.</span>'}
      <h2>Your entangled states<span class="good">${me.bell.length}</span></h2>${bells}
      <p class="note" style="margin:0">Shops owned: ${owned}. Next shop needs ${next} entangled states and ${money(CONFIG.claimPrice)}.</p></section>`;
  }
  const bellHTML = b => `<div class="bell${b.bell ? '' : ' plain'}"><span class="pair"><span class="orb"></span><span class="bond"></span><span class="orb"></span></span><b>${esc(b.name)}</b><span class="amp">${esc(b.text)}</span></div>`;

  function playersPanel(s) {
    const rows = s.order.map((id, i) => {
      const p = s.players[id], online = !lobby || (lobby.players.find(x => x.id === id) || {}).online !== false;
      const toks = Object.keys(GATES).filter(g => p.tokens[g] > 0).map(g => `${g}×${p.tokens[g]}`).join(' ');
      return `<div class="prow${id === s.currentPlayer ? ' cur' : ''}">${dotHTML(i, p.name)}
        <div><b>${esc(p.name)}</b>${id === myId ? ' (you)' : ''}${online ? '' : ' <span class="note">offline</span>'}${p.inJail ? ' <span class="bad">in jail</span>' : ''}
        <div class="st">${money(p.cash)}, ${p.qubits.length} card${p.qubits.length === 1 ? '' : 's'}${toks ? ', tokens ' + toks : ''}${s.tilesOwned[id] ? ', ' + s.tilesOwned[id] + ' tile' + (s.tilesOwned[id] === 1 ? '' : 's') : ''}</div></div>
        <div class="score">${p.bell.length}<small>entangled</small></div></div>`;
    }).join('');
    const host = s.hostId === myId;
    return `<section class="panel"><h2>Players</h2>${rows}
      ${host ? `<button data-act="endGame">${ui.confirmEnd ? 'Click again to end the game' : 'End game and count scores'}</button>` : ''}
      <button data-act="leave">${ui.confirmLeave ? 'Click again to leave this room for good' : 'Leave room'}</button>
      <p class="note" style="margin:0">Room code <b>${esc(lobby ? lobby.code : '')}</b>. Friends can join with it at any time.</p></section>`;
  }

  function guidePanel() {
    const one = ['H', 'X', 'Z'].map(g => {
      const map = Q.LABELS.map(l => `<span>${ket(l)} → ${ket(Q.applySingle(g, l))}</span>`).join('');
      return `<details class="guide" ${gstyle(g)}><summary>${gtag(g)} ${GATES[g].name}</summary><p class="note">${esc(GATES[g].blurb)}</p><div class="map">${map}</div></details>`;
    });
    const two = ['CNOT', 'CZ'].map(g => {
      const rows = [];
      for (const c of Q.LABELS) for (const t of Q.LABELS) {
        const r = Q.applyTwo(g, c, t); if (r.entangled) rows.push(`<span>${ket(c)}${ket(t)} → ${esc(r.name === 'Bell-type' ? r.text : r.name)}</span>`);
      }
      return `<details class="guide" ${gstyle(g)}><summary>${gtag(g)} ${GATES[g].name}</summary><p class="note">${esc(GATES[g].blurb)}</p><p class="note" style="margin:0">Control then target. These pairs entangle:</p><div class="map">${rows.join('')}</div></details>`;
    });
    const h = n => n.length ? n.map(x => 'H on ' + x).join(' + ') : 'no H';
    const fam = { Z: ['0', '1'], X: ['+', '−'] };
    const table = ['X', 'Z'].flatMap(cf => ['Z', 'X'].map(tf => {
      const c = cf === 'X' ? '+' : '0', t = tf === 'X' ? '+' : '0';
      return `<tr><td>${fam[cf].map(l => ket(l)).join(' ')}</td><td>${fam[tf].map(l => ket(l)).join(' ')}</td><td>${h(Q.hTokensNeeded('CNOT', c, t))}</td><td>${h(Q.hTokensNeeded('CZ', c, t))}</td></tr>`;
    })).join('');
    return `<section class="panel"><h2>How to entangle</h2>
      <p class="note" style="margin:0">The control card must be |+⟩ or |−⟩. H turns |0⟩ into |+⟩ and |1⟩ into |−⟩ (and back). Every token is used once.</p>
      <table class="recipe"><thead><tr><th>Control</th><th>Target</th><th>CNOT needs</th><th>CZ needs</th></tr></thead><tbody>${table}</tbody></table>
      <p class="note" style="margin:0">X and Z tokens do not decide whether you entangle. They choose which entangled state you get.</p>
      ${one.join('')}${two.join('')}</section>`;
  }

  function logPanel(s) {
    return `<section class="panel"><h2>Log</h2><div class="logbox" id="logbox">${s.log.slice(-14).map(e => `<div>${esc(e.msg)}</div>`).join('')}</div></section>`;
  }

  // ---------- render ----------
  function render() {
    const s = S; if (!s || !s.players[myId]) return;
    $('#entry').classList.add('hidden'); $('#lobby').classList.add('hidden'); $('#game').classList.remove('hidden');
    const me = s.players[myId], mine = s.currentPlayer === myId;
    // drop stale compose state
    if (!mine || s.phase !== 'act' || s.pending) { ui.compose = null; ui.sel = []; ui.recycle = false; }
    ui.sel = ui.sel.filter(i => i < me.qubits.length);
    $('#board').innerHTML = boardHTML(s);
    $('#side').innerHTML = turnPanel(s, me, mine) + (ui.compose ? composePanel(s, me) : '') + handPanel(s, me, mine) + playersPanel(s) + guidePanel() + logPanel(s);
    prevHand = me.qubits.join(',');
    const lb = $('#logbox'); if (lb) lb.scrollTop = lb.scrollHeight;
    renderOver(s);
  }

  function renderOver(s) {
    const o = $('#over');
    if (!s.over) { o.classList.add('hidden'); return; }
    o.classList.remove('hidden');
    const top = s.results[0].entangled;
    const why = s.reason === 'target' ? `${esc(s.results[0].name)} reached ${s.target} entangled states.` : 'The host ended the game.';
    o.innerHTML = `<div class="box"><h1 id="overtitle">Game over</h1><p class="note" style="margin:0">${why}</p>
      <ol>${s.results.map(r => `<li><b>${esc(r.name)}</b>: ${r.entangled} entangled, ${money(r.cash)}${r.entangled === top ? ' <span class="good">top</span>' : ''}</li>`).join('')}</ol>
      ${s.left && s.left.length ? `<p class="note" style="margin:0">Left during the game: ${s.left.map(esc).join(', ')}.</p>` : ''}
      <p class="note" style="margin:0">Most entangled states wins. Ties are broken by cash.</p>
      <button data-act="leaveNow">Leave room</button></div>`;
  }

  // ---------- input ----------
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-q]'), b = e.target.closest('[data-act]');
    if (q && S) {
      const i = +q.dataset.q;
      if (ui.recycle) { send({ type: 'recycle', q: i }); ui.recycle = false; return; }
      if (ui.compose) {
        const kind = GATES[ui.compose.gate].kind, at = ui.sel.indexOf(i);
        if (kind === 'two') { if (at >= 0) ui.sel.splice(at, 1); else ui.sel = ui.sel.length < 2 ? [...ui.sel, i] : [ui.sel[0], i]; }
        else ui.sel = at >= 0 ? [] : [i];
        render();
      }
      return;
    }
    if (!b) return;
    const a = b.dataset.act;
    if (a !== 'endGame' && ui.confirmEnd) ui.confirmEnd = false;
    if (a !== 'leave' && ui.confirmLeave) ui.confirmLeave = false;
    switch (a) {
      case 'roll': case 'payJail': case 'end': case 'buyToken': case 'claim': send({ type: a }); break;
      case 'buyState': send({ type: 'buyState', mode: b.dataset.mode, label: b.dataset.label }); break;
      case 'answer': send({ type: 'answer', choice: +b.dataset.i }); break;
      case 'marketBuy': send({ type: 'marketBuy', index: +b.dataset.i }); break;
      case 'recycleToggle': ui.recycle = !ui.recycle; ui.compose = null; ui.sel = []; render(); break;
      case 'use': ui.compose = { gate: b.dataset.gate }; ui.sel = []; ui.recycle = false; render(); break;
      case 'cancel': ui.compose = null; ui.sel = []; render(); break;
      case 'confirm': {
        const { gate } = ui.compose, kind = GATES[gate].kind, m = { type: 'applyGate', gate };
        if (kind === 'one') m.q = ui.sel[0]; else { m.a = ui.sel[0]; m.b = ui.sel[1]; }
        send(m); ui.compose = null; ui.sel = []; break;
      }
      case 'leaveNow': socket.emit('leave'); break;
      case 'leave':
        if (ui.confirmLeave) { socket.emit('leave'); ui.confirmLeave = false; } else { ui.confirmLeave = true; render(); }
        break;
      case 'endGame':
        if (ui.confirmEnd) { send({ type: 'endGame' }); ui.confirmEnd = false; } else { ui.confirmEnd = true; render(); }
        break;
    }
  });
})();
