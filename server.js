const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const STEP = 30;
const rooms = {};

function generateCode() { return Math.floor(1000 + Math.random() * 9000).toString(); }

function rand(max) { return Math.floor(Math.random() * max); }

function randomGrid(max) { return Math.floor(Math.random() * max / STEP) * STEP; }

let uidCounter = 0;
function uid() { return ++uidCounter; }

const SWORD_CFG = {
  normal: { dmg: 1, selfDmg: 3 },
  gold:   { dmg: 3, selfDmg: 1 },
  ice:    { dmg: 1, selfDmg: 0 },
  fire:   { dmg: 1, selfDmg: 2 },
  life:   { dmg: 1, selfDmg: 0 },
  poison: { dmg: 1, selfDmg: 2 },
};

const SWORD_TYPES = [
  { type: 'normal', minWave: 1, weight: 100 },
  { type: 'gold',   minWave: 3, weight: 40 },
  { type: 'ice',    minWave: 4, weight: 30 },
  { type: 'fire',   minWave: 5, weight: 25 },
  { type: 'life',   minWave: 5, weight: 20 },
  { type: 'poison', minWave: 6, weight: 15 },
];

function createRoom() {
  return {
    started: false,
    wave: 0,
    players: {},
    greens: [],
    triangles: [],
    bullets: [],
    hearts: [],
    groundSwords: [],
    fireZones: [],
    greenUid: 0,
    intervals: [],
    waveCleared: true,
  };
}

// ============ SPAWN ============
function spawnGreen(g) {
  const gr = { uid: g.greenUid++, id: uid(), x: randomGrid(1400), y: randomGrid(800), hp: 3, sword: null, frozen: false, poisonTicks: 0, lastPoison: 0 };
  g.greens.push(gr);
  return gr;
}

function spawnTriangle(g) {
  const t = { id: uid(), x: randomGrid(1400), y: randomGrid(800), hp: 5, frozen: false };
  g.triangles.push(t);
  return t;
}

function spawnHeart(g) {
  g.hearts.push({ id: uid(), x: randomGrid(1400), y: randomGrid(800) });
}

function spawnSword(g) {
  if (g.wave < 1) return;
  if (g.groundSwords.length >= 3) return;
  const avail = SWORD_TYPES.filter(t => g.wave >= t.minWave);
  const total = avail.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  let chosen = avail[0].type;
  for (const t of avail) { r -= t.weight; if (r <= 0) { chosen = t.type; break; } }
  g.groundSwords.push({ id: uid(), x: randomGrid(1400), y: randomGrid(800), type: chosen });
}

function startWave(g) {
  if (g.started === false) return;
  g.wave++;
  g.waveCleared = false;
  const count = g.wave + 2;
  for (let i = 0; i < count; i++) spawnGreen(g);
  if (g.wave >= 2) for (let i = 0; i < Math.floor(g.wave / 2) + 1; i++) spawnHeart(g);
  if (g.wave >= 3) for (let i = 0; i < Math.floor((g.wave - 1) / 2); i++) spawnTriangle(g);
  spawnSword(g);
  broadcastState(g);
}

// ============ COLLISION / COMBAT ============
function closestPlayer(g, x, y) {
  let min = Infinity, cp = null;
  for (const p of Object.values(g.players)) {
    const d = Math.abs(p.x - x) + Math.abs(p.y - y);
    if (d < min) { min = d; cp = p; }
  }
  return cp;
}

function swordHitGreen(g, gr, p) {
  const c = SWORD_CFG[p.sword] || SWORD_CFG.normal;
  p.hp -= c.selfDmg;
  if (p.sword === 'life') p.hp = Math.min(p.hp + 2, 100);
  gr.hp -= c.dmg;
  if (p.sword === 'ice') gr.frozen = true;
  if (p.sword === 'poison') { gr.poisonTicks = 3; gr.lastPoison = Date.now(); }
  if (gr.hp <= 0) { explodeGreen(g, gr, p.sword === 'fire'); }
  if (p.sword === 'fire' && gr.hp > 0) {
    for (const n of [...g.greens]) {
      if (n === gr) continue;
      if (Math.abs(gr.x - n.x) <= 60 && Math.abs(gr.y - n.y) <= 60) {
        n.hp -= 2;
        if (n.hp <= 0) explodeGreen(g, n, true);
      }
    }
  }
  checkWaveCleared(g);
}

function greenNoSwordCollision(g, gr, p) {
  if (gr.sword === 'ice') {
    p.slowed = Date.now() + 2000;
    p.hp -= 8;
    g.greens = g.greens.filter(e => e !== gr);
  } else if (gr.sword === 'poison') {
    p.poisoned = { ticks: 3, lastTick: Date.now() };
    p.hp -= 5;
    g.greens = g.greens.filter(e => e !== gr);
  } else {
    p.hp -= 15;
    g.greens = g.greens.filter(e => e !== gr);
  }
  checkWaveCleared(g);
}

function explodeGreen(g, gr, isFire) {
  const cx = gr.x + 15;
  const cy = gr.y + 15;
  g.greens = g.greens.filter(e => e !== gr);
  if (isFire) {
    for (const n of [...g.greens]) {
      if (Math.abs(cx - 15 - n.x) <= 60 && Math.abs(cy - 15 - n.y) <= 60) {
        n.hp -= 2;
        if (n.hp <= 0) explodeGreen(g, n, false);
      }
    }
    for (const p of Object.values(g.players)) {
      if (Math.abs(p.x - (cx - 15)) <= 60 && Math.abs(p.y - (cy - 15)) <= 60) {
        p.hp -= 10;
      }
    }
  }
  checkWaveCleared(g);
}

function swordHitTriangle(g, t, p) {
  const c = SWORD_CFG[p.sword] || SWORD_CFG.normal;
  p.hp -= c.selfDmg;
  if (p.sword === 'life') p.hp = Math.min(p.hp + 2, 100);
  t.hp -= c.dmg;
  if (t.hp <= 0) { g.triangles = g.triangles.filter(e => e !== t); }
}

// ============ GAME LOOP ============
function moveGreens(g) {
  for (const gr of [...g.greens]) {
    if (!g.greens.includes(gr)) continue;
    if (gr.frozen) continue;
    const p = closestPlayer(g, gr.x, gr.y);
    if (!p) continue;
    if (Math.abs(p.x - gr.x) < STEP && Math.abs(p.y - gr.y) < STEP) {
      if (p.sword) swordHitGreen(g, gr, p);
      else greenNoSwordCollision(g, gr, p);
      continue;
    }
    if (Math.abs(p.x - gr.x) >= Math.abs(p.y - gr.y)) {
      if (p.x > gr.x) gr.x += STEP; else if (p.x < gr.x) gr.x -= STEP;
    } else {
      if (p.y > gr.y) gr.y += STEP; else if (p.y < gr.y) gr.y -= STEP;
    }
    gr.x = Math.max(0, Math.min(1400, gr.x));
    gr.y = Math.max(0, Math.min(800, gr.y));
    for (const sw of g.groundSwords) {
      if (gr.x === sw.x && gr.y === sw.y) {
        const bonus = sw.type === 'gold' ? 5 : (sw.type === 'ice' || sw.type === 'fire') ? 3 : 2;
        gr.sword = sw.type;
        gr.hp += bonus;
        g.groundSwords = g.groundSwords.filter(s => s !== sw);
        break;
      }
    }
    if (!g.greens.includes(gr)) continue;
    if (Math.abs(p.x - gr.x) < STEP && Math.abs(p.y - gr.y) < STEP) {
      if (p.sword) swordHitGreen(g, gr, p);
      else greenNoSwordCollision(g, gr, p);
    }
  }
  processGreenEffects(g);
}

function processGreenEffects(g) {
  const now = Date.now();
  for (const gr of [...g.greens]) {
    if (!g.greens.includes(gr)) continue;
    for (const z of g.fireZones) {
      if (Math.abs(gr.x - z.x) <= STEP * 1.5 && Math.abs(gr.y - z.y) <= STEP * 1.5) {
        if (!z.lastDamaged) z.lastDamaged = {};
        if (!z.lastDamaged[gr.uid] || now - z.lastDamaged[gr.uid] >= 1000) {
          gr.hp -= 5;
          if (gr.hp <= 0) { explodeGreen(g, gr, false); break; }
          z.lastDamaged[gr.uid] = now;
        }
      }
    }
    if (gr.hp <= 0) continue;
    if (gr.sword === 'life' && gr.hp < 5) gr.hp++;
    if (gr.poisonTicks > 0 && now - gr.lastPoison >= 1000) {
      gr.hp--;
      if (gr.hp <= 0) { explodeGreen(g, gr, false); continue; }
      gr.poisonTicks--;
      gr.lastPoison = now;
    }
  }
}

function moveTriangles(g) {
  for (const t of [...g.triangles]) {
    if (!g.triangles.includes(t)) continue;
    if (t.frozen) continue;
    const p = closestPlayer(g, t.x, t.y);
    if (!p) continue;
    if (Math.abs(p.x - t.x) < STEP && Math.abs(p.y - t.y) < STEP) {
      if (p.sword) swordHitTriangle(g, t, p);
      else { p.hp -= 8; g.triangles = g.triangles.filter(e => e !== t); }
      continue;
    }
    if (Math.abs(p.x - t.x) >= Math.abs(p.y - t.y)) {
      if (p.x > t.x) t.x += STEP; else if (p.x < t.x) t.x -= STEP;
    } else {
      if (p.y > t.y) t.y += STEP; else if (p.y < t.y) t.y -= STEP;
    }
    t.x = Math.max(0, Math.min(1400, t.x));
    t.y = Math.max(0, Math.min(800, t.y));
    if (!g.triangles.includes(t)) continue;
    if (Math.abs(p.x - t.x) < STEP && Math.abs(p.y - t.y) < STEP) {
      if (p.sword) swordHitTriangle(g, t, p);
      else { p.hp -= 8; g.triangles = g.triangles.filter(e => e !== t); }
    }
  }
}

function triangleShoot(g) {
  for (const t of g.triangles) {
    if (t.frozen) continue;
    const p = closestPlayer(g, t.x, t.y);
    if (!p) continue;
    const tx = t.x + 15, ty = t.y + 13;
    const dx = p.x + 15 - tx, dy = p.y + 15 - ty;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) continue;
    const speed = 5;
    g.bullets.push({ id: uid(), x: tx - 4, y: ty - 4, vx: dx / d * speed, vy: dy / d * speed });
  }
}

function moveBullets(g) {
  for (const b of [...g.bullets]) {
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < -20 || b.x > 1420 || b.y < -20 || b.y > 820) {
      g.bullets = g.bullets.filter(e => e !== b); continue;
    }
    for (const p of Object.values(g.players)) {
      if (Math.abs(p.x + 15 - (b.x + 4)) < 15 && Math.abs(p.y + 15 - (b.y + 4)) < 15) {
        p.hp -= 5;
        g.bullets = g.bullets.filter(e => e !== b);
        break;
      }
    }
  }
}

function applyPlayerEffects(g) {
  for (const p of Object.values(g.players)) {
    if (p.poisoned && p.poisoned.ticks > 0) {
      if (Date.now() - p.poisoned.lastTick >= 1000) {
        p.hp--;
        p.poisoned.ticks--;
        p.poisoned.lastTick = Date.now();
      }
    }
  }
}

function healPlayers(g) {
  for (const p of Object.values(g.players)) {
    p.hp = Math.min(p.hp + 1, 100);
  }
}

function checkWaveCleared(g) {
  if (g.greens.length === 0 && !g.waveCleared && g.started) {
    g.waveCleared = true;
    setTimeout(() => startWave(g), 2000);
  }
}

function checkGameOver(g) {
  for (const p of Object.values(g.players)) {
    if (p.hp <= 0) {
      const code = socketRoomCode(g);
      io.to(code).emit('gameOver', g.wave);
      clearIntervals(g);
      g.started = false;
      return;
    }
  }
}

// ============ STATE BROADCAST ============
function buildState(g) {
  const players = {};
  for (const [id, p] of Object.entries(g.players)) {
    players[id] = { x: p.x, y: p.y, hp: p.hp, sword: p.sword, color: p.color };
  }
  return {
    started: g.started,
    wave: g.wave,
    greens: g.greens.map(gr => ({ id: gr.id, x: gr.x, y: gr.y, hp: gr.hp, sword: gr.sword, frozen: gr.frozen })),
    triangles: g.triangles.map(t => ({ id: t.id, x: t.x, y: t.y, hp: t.hp, frozen: t.frozen })),
    bullets: g.bullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
    hearts: g.hearts.map(h => ({ id: h.id, x: h.x, y: h.y })),
    groundSwords: g.groundSwords.map(s => ({ id: s.id, x: s.x, y: s.y, type: s.type })),
    fireZones: g.fireZones.map(z => ({ x: z.x, y: z.y })),
    players,
  };
}

function broadcastState(g) {
  if (!g) return;
  const code = socketRoomCode(g);
  if (!code) return;
  io.to(code).emit('gameState', buildState(g));
  for (const p of Object.values(g.players)) {
    if (p.hp <= 0) { checkGameOver(g); return; }
  }
}

function socketRoomCode(g) {
  for (const code in rooms) { if (rooms[code] === g) return code; }
  return null;
}

function startIntervals(g) {
  clearIntervals(g);
  g.intervals.push(setInterval(() => { moveGreens(g); broadcastState(g); }, 1500));
  g.intervals.push(setInterval(() => { moveTriangles(g); broadcastState(g); }, 1500));
  g.intervals.push(setInterval(() => { triangleShoot(g); }, 2500));
  g.intervals.push(setInterval(() => { moveBullets(g); broadcastState(g); }, 50));
  g.intervals.push(setInterval(() => { applyPlayerEffects(g); broadcastState(g); }, 1000));
  g.intervals.push(setInterval(() => { healPlayers(g); broadcastState(g); }, 5000));
  g.intervals.push(setInterval(() => { spawnSword(g); broadcastState(g); }, 10000));
}

function clearIntervals(g) {
  for (const id of g.intervals) clearInterval(id);
  g.intervals = [];
}

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', () => {
    let code;
    do { code = generateCode(); } while (rooms[code]);
    const g = createRoom();
    rooms[code] = g;
    socket.join(code);
    socket.roomCode = code;
    socket.emit('roomCreated', code);
  });

  socket.on('joinRoom', (code) => {
    const g = rooms[code];
    if (!g) { socket.emit('joinError', 'Código inválido'); return; }
    if (Object.keys(g.players).length >= 4) { socket.emit('joinError', 'Sala llena'); return; }
    socket.join(code);
    socket.roomCode = code;
    socket.emit('roomJoined', code);
    socket.to(code).emit('playerJoined', socket.id);
    if (g.started) {
      g.players[socket.id] = { x: 300, y: 300, hp: 100, sword: null, color: '#f1c40f', poisoned: null, slowed: 0 };
      socket.emit('gameStarted');
      socket.emit('gameState', buildState(g));
      broadcastState(g);
    }
  });

  socket.on('startGame', () => {
    const g = rooms[socket.roomCode];
    if (!g || g.started) return;
    g.started = true;
    const roomSockets = io.sockets.adapter.rooms.get(socket.roomCode);
    if (roomSockets) {
      for (const sid of roomSockets) {
        if (!g.players[sid]) {
          g.players[sid] = { x: 300, y: 300, hp: 100, sword: null, color: '#f1c40f', poisoned: null, slowed: 0 };
        }
      }
    }
    io.to(socket.roomCode).emit('gameStarted');
    startIntervals(g);
    startWave(g);
  });

  socket.on('playerMove', (dir) => {
    const g = rooms[socket.roomCode];
    if (!g || !g.started) return;
    const p = g.players[socket.id];
    if (!p || p.hp <= 0) return;
    const step = p.slowed && Date.now() < p.slowed ? STEP / 2 : STEP;
    switch (dir) {
      case 'up':    p.y -= step; break;
      case 'down':  p.y += step; break;
      case 'left':  p.x -= step; break;
      case 'right': p.x += step; break;
      default: return;
    }
    p.x = Math.max(0, Math.min(1400, p.x));
    p.y = Math.max(0, Math.min(800, p.y));
    for (const sw of [...g.groundSwords]) {
      if (Math.abs(p.x - sw.x) < STEP && Math.abs(p.y - sw.y) < STEP) {
        p.sword = sw.type;
        g.groundSwords = g.groundSwords.filter(s => s !== sw);
        break;
      }
    }
    for (const h of [...g.hearts]) {
      if (Math.abs(p.x - h.x) < STEP && Math.abs(p.y - h.y) < STEP) {
        p.hp = Math.min(p.hp + 5, 100);
        g.hearts = g.hearts.filter(e => e !== h);
        break;
      }
    }
    for (const gr of [...g.greens]) {
      if (!g.greens.includes(gr)) continue;
      if (Math.abs(p.x - gr.x) < STEP && Math.abs(p.y - gr.y) < STEP) {
        if (p.sword) { swordHitGreen(g, gr, p); }
        else { greenNoSwordCollision(g, gr, p); }
      }
    }
    for (const t of [...g.triangles]) {
      if (!g.triangles.includes(t)) continue;
      if (Math.abs(p.x - t.x) < STEP && Math.abs(p.y - t.y) < STEP) {
        if (p.sword) { swordHitTriangle(g, t, p); }
        else { p.hp -= 8; g.triangles = g.triangles.filter(e => e !== t); }
      }
    }
    broadcastState(g);
  });

  socket.on('placeFire', () => {
    const g = rooms[socket.roomCode];
    if (!g || !g.started) return;
    const p = g.players[socket.id];
    if (!p || p.sword !== 'fire') return;
    const zx = Math.round(p.x / STEP) * STEP;
    const zy = Math.round(p.y / STEP) * STEP;
    g.fireZones.push({ x: zx, y: zy, time: Date.now(), lastDamaged: {} });
    p.sword = null;
    broadcastState(g);
  });

  socket.on('iceFreeze', () => {
    const g = rooms[socket.roomCode];
    if (!g || !g.started) return;
    const p = g.players[socket.id];
    if (!p || p.sword !== 'ice') return;
    for (const gr of g.greens) gr.frozen = true;
    for (const t of g.triangles) t.frozen = true;
    p.sword = null;
    broadcastState(g);
  });

  socket.on('waveCleared', () => {
    const g = rooms[socket.roomCode];
    if (g) checkWaveCleared(g);
  });

  socket.on('updateColor', (color) => {
    const g = rooms[socket.roomCode];
    const p = g?.players[socket.id];
    if (p) p.color = color;
  });

  socket.on('disconnect', () => {
    const g = rooms[socket.roomCode];
    if (g) {
      delete g.players[socket.id];
      io.to(socket.roomCode).emit('playerLeft', socket.id);
      if (Object.keys(g.players).length === 0) {
        clearIntervals(g);
        delete rooms[socket.roomCode];
      } else {
        broadcastState(g);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
