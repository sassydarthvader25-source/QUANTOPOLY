const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const engine = require('./game/engine');
const { CONFIG } = require('./game/board');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_q, r) => r.send('ok'));
// rules data the browser also needs (gate maths for previews, board layout)
const SHARED = new Set(['quantum.js', 'board.js']);
app.get('/shared/:f', (q, r) => SHARED.has(q.params.f) ? r.sendFile(path.join(__dirname, 'game', q.params.f)) : r.sendStatus(404));

// rooms: code -> { code, hostId, started, target, state, players: [{id, name, token, socketId}] }
// Rooms stay open for the whole game: people can join late, leave, or reconnect.
const rooms = new Map();
const newCode = () => { let c; do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c)); return c; };
const cleanName = n => String(n || 'Player').trim().slice(0, 20) || 'Player';
const lobbyView = r => ({ code: r.code, hostId: r.hostId, started: r.started, players: r.players.map(p => ({ id: p.id, name: p.name, online: !!p.socketId })) });

function broadcast(r) {
  io.to(r.code).emit('lobby', lobbyView(r));
  if (!r.started) return;
  for (const p of r.players) if (p.socketId) io.to(p.socketId).emit('state', engine.viewFor(r.state, p.id));
}

io.on('connection', socket => {
  let room = null, me = null;
  const attach = (r, p) => {
    room = r; me = p; p.socketId = socket.id; socket.join(r.code);
    socket.emit('joined', { code: r.code, id: p.id, token: p.token });
    broadcast(r);
  };
  const newSeat = name => ({ id: crypto.randomUUID(), name: cleanName(name), token: crypto.randomBytes(16).toString('hex'), socketId: null });

  socket.on('create', ({ name } = {}) => {
    if (room) return;
    const r = { code: newCode(), hostId: null, started: false, target: null, state: null, players: [] };
    const p = newSeat(name);
    r.hostId = p.id; r.players.push(p); rooms.set(r.code, r); attach(r, p);
  });

  socket.on('join', ({ code, name, token } = {}) => {
    if (room) return;
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return socket.emit('err', 'Room not found');
    const back = token && r.players.find(p => p.token === token);      // reconnect to the same seat
    if (back) return attach(r, back);
    if (r.players.length >= CONFIG.maxPlayers) return socket.emit('err', 'Room full');
    if (r.started && r.state.over) return socket.emit('err', 'That game has finished');
    const p = newSeat(name);
    r.players.push(p);
    if (r.started) r.state = engine.addPlayer(r.state, { id: p.id, name: p.name }); // late joiner starts like everyone else
    attach(r, p);
  });

  socket.on('start', ({ target } = {}) => {
    if (!room || me.id !== room.hostId || room.started || room.players.length < 2) return;
    room.started = true;
    room.state = engine.createGame(room.players.map(p => ({ id: p.id, name: p.name })), { hostId: room.hostId, target: Math.min(99, parseInt(target, 10)) || null });
    broadcast(room);
  });

  socket.on('action', action => {
    if (!room || !room.started) return;
    const res = engine.applyAction(room.state, me.id, action);
    if (!res.ok) return socket.emit('err', res.error);
    room.state = res.state; broadcast(room);
  });

  // Leave for good: seat, cards and shops are released, and you can join or create another room.
  socket.on('leave', () => {
    if (!room) return;
    const r = room, p = me;
    r.players = r.players.filter(x => x.id !== p.id);
    socket.leave(r.code);
    room = null; me = null;
    socket.emit('left');
    if (!r.players.length) { rooms.delete(r.code); return; }
    if (r.hostId === p.id) r.hostId = r.players[0].id;
    if (r.started) {
      r.state = engine.removePlayer(r.state, p.id);
      if (r.state.hostId !== r.hostId) r.state.hostId = r.hostId;
    }
    broadcast(r);
  });

  socket.on('disconnect', () => { if (me) { me.socketId = null; if (room) broadcast(room); } });
});

// Drop rooms nobody is connected to, after 30 minutes without activity.
setInterval(() => {
  for (const [c, r] of rooms) {
    if (r.players.some(p => p.socketId)) { r.idleSince = null; continue; }
    r.idleSince = r.idleSince || Date.now();
    if (Date.now() - r.idleSince > 30 * 60 * 1000) rooms.delete(c);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
