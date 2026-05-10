const SWORD_CFG = {
  normal: { dmg: 1, selfDmg: 3 },
  gold: { dmg: 3, selfDmg: 1 },
  ice: { dmg: 2, selfDmg: 0 },
  fire: { dmg: 2, selfDmg: 2 },
  life: { dmg: 2, selfDmg: 0 },
  poison: { dmg: 0.1, selfDmg: 2 },
};

const SWORD_TYPES_MP = [
  { type: 'normal', minWave: 1, weight: 100 },
  { type: 'gold', minWave: 3, weight: 40 },
  { type: 'ice', minWave: 4, weight: 30 },
  { type: 'fire', minWave: 5, weight: 25 },
  { type: 'life', minWave: 5, weight: 20 },
  { type: 'poison', minWave: 6, weight: 15 },
];

const MP = {
  peer: null,
  isHost: false,
  started: false,
  connections: [],
  conn: null,
  wave: 0,
  players: {},
  greens: [],
  triangles: [],
  bullets: [],
  hearts: [],
  groundSwords: [],
  fireZones: [],
  fx: [],
  trails: [],
  boss: null,
  bossBullets: [],
  bossBulletUid: 0,
  greenUid: 0,
  bulletUid: 0,
  STEP: 30,
  MAP_W: 1400,
  MAP_H: 800,
  intervals: [],
  myId: null,
};

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function randomGrid(max) {
  return Math.floor(Math.random() * max / MP.STEP) * MP.STEP;
}

function mpCreateRoom() {
  const code = generateRoomCode();
  if (MP.peer) MP.peer.destroy();
  MP.peer = new Peer(code);
  MP.peer.on('open', id => {
    MP.myId = id;
    MP.isHost = true;
    document.getElementById('room-code-big').textContent = id;
    showPanel('room-created');
  });
  MP.peer.on('connection', conn => {
    MP.connections.push(conn);
    setupMpConn(conn);
  });
  MP.peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      mpCreateRoom();
    } else {
      alert('Error al crear sala: ' + err.type);
    }
  });
}

function mpJoinRoom(code) {
  MP.peer = new Peer();
  MP.peer.on('open', () => {
    MP.myId = MP.peer.id;
    MP.conn = MP.peer.connect(code, { reliable: true });
    setupMpConn(MP.conn);
    MP.conn.on('open', () => {
      const sqColor = document.getElementById('color-square').value;
      const circColor = document.getElementById('color-circle').value;
      const skinVal = document.getElementById('skin-select').value;
      const centerVal = document.getElementById('center-shape').value;
      MP.conn.send({ type: 'join', color: sqColor, circleColor: circColor, skin: skinVal, center: centerVal });
      showPanel('waiting-for-start');
    });
  });
  MP.peer.on('error', err => {
    if (err.type === 'peer-unavailable') {
      alert('Código de sala inválido');
    } else {
      alert('Error: ' + err.type);
    }
  });
}

function setupMpConn(conn) {
  conn.on('data', data => {
    if (MP.isHost) handleHostData(conn, data);
    else handleClientData(data);
  });
  conn.on('close', () => {
    if (MP.isHost) {
      MP.connections = MP.connections.filter(c => c !== conn);
      for (const [id, p] of Object.entries(MP.players)) {
        if (p.conn === conn) {
          delete MP.players[id];
          const el = document.querySelector(`.other-player[data-peer="${id}"]`);
          if (el) el.remove();
          break;
        }
      }
    } else {
      alert('Conexión perdida con el anfitrión');
      mpLeaveGame();
    }
  });
}

// ============ HOST DATA HANDLING ============

function handleHostData(conn, data) {
  switch (data.type) {
    case 'join':
      const pid = conn.peer;
      MP.players[pid] = {
        conn,
        x: randomGrid(MP.MAP_W),
        y: randomGrid(MP.MAP_H),
        hp: 100,
        sword: null,
        color: data.color || '#f1c40f',
        circleColor: data.circleColor || '#e94560',
        skin: data.skin || 'solid',
        center: data.center || 'circle',
        poisoned: null,
        slowed: 0,
      };
      if (MP.started) {
        conn.send(buildMpState());
      }
      broadcastMp({ type: 'playerJoined' }, [conn]);
      break;
    case 'move':
      const p = MP.players[conn.peer];
      if (p && MP.started && p.hp > 0) { mpProcessMove(p, data.dir); broadcastMpState(); }
      break;
    case 'placeFire':
      const pf = MP.players[conn.peer];
      if (pf && pf.sword === 'fire' && MP.started) {
        const zx = Math.round(pf.x / MP.STEP) * MP.STEP;
        const zy = Math.round(pf.y / MP.STEP) * MP.STEP;
        MP.fireZones.push({ x: zx, y: zy, time: Date.now(), lastDamaged: {} });
        pf.sword = null;
        broadcastMpState();
      }
      break;
    case 'iceFreeze':
      const ip = MP.players[conn.peer];
      if (ip && ip.sword === 'ice' && MP.started) {
        for (const g of MP.greens) g.frozen = true;
        for (const t of MP.triangles) t.frozen = true;
        ip.sword = null;
        broadcastMpState();
      }
      break;
    case 'updateColor':
      const cp = MP.players[conn.peer];
      if (cp) cp.color = data.color;
      break;
  }
}

// ============ CLIENT DATA HANDLING ============

function handleClientData(data) {
  if (data.type === 'state') {
    if (!MP.started) {
      MP.started = true;
      mpHideLobby();
    }
    renderMpState(data);
  } else if (data.type === 'gameStarted') {
    MP.started = true;
    mpHideLobby();
  } else if (data.type === 'gameOver') {
    MP.started = false;
    mpStopIntervals();
    document.getElementById('boss-hp-bar').classList.remove('show');
    finalWave.textContent = data.wave;
    gameOverScreen.classList.add('show');
  } else if (data.type === 'gameWin') {
    MP.started = false;
    mpStopIntervals();
    document.getElementById('boss-hp-bar').classList.remove('show');
    document.getElementById('game-over-box').querySelector('h1').textContent = 'Victoria!';
    document.getElementById('game-over-box').querySelector('p').innerHTML = 'Derrotaste al jefe final!';
    gameOverScreen.classList.add('show');
  }
}

// ============ HOST GAME START ============

function mpHostStartGame() {
  if (!MP.isHost || MP.started) return;
  if (MP.connections.length === 0) {
    alert('Espera a que se conecte al menos un jugador');
    return;
  }
  MP.started = true;

  const sqColor = document.getElementById('color-square').value;
  const circColor = document.getElementById('color-circle').value;
  const skinVal = document.getElementById('skin-select').value;
  const centerVal = document.getElementById('center-shape').value;
  MP.players[MP.myId] = {
    conn: null,
    x: randomGrid(MP.MAP_W),
    y: randomGrid(MP.MAP_H),
    hp: 100,
    sword: null,
    color: sqColor,
    circleColor: circColor,
    skin: skinVal,
    center: centerVal,
    poisoned: null,
    slowed: 0,
  };

  broadcastMp({ type: 'gameStarted' });
  mpStartWave();
  mpStartIntervals();
  mpHideLobby();
}

function mpHideLobby() {
  startScreen.style.display = 'none';
}

// ============ HOST GAME LOGIC ============

function mpStartWave() {
  MP.wave++;
  announceWave(MP.wave);
  if (MP.wave === 10) {
    mpSpawnBoss();
    broadcastMpState();
    return;
  }
  const count = MP.wave + 2;
  for (let i = 0; i < count; i++) mpSpawnGreen();
  if (MP.wave >= 2) for (let i = 0; i < Math.floor(MP.wave / 2) + 1; i++) mpSpawnHeart();
  if (MP.wave >= 3) for (let i = 0; i < Math.floor((MP.wave - 1) / 2); i++) mpSpawnTriangle();
  mpSpawnSword();
  broadcastMpState();
}

function mpSpawnGreen() {
  let x, y, ok;
  let attempts = 0;
  do {
    x = randomGrid(MP.MAP_W);
    y = randomGrid(MP.MAP_H);
    ok = true;
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - x) < MP.STEP && Math.abs(p.y - y) < MP.STEP) { ok = false; break; }
    }
  } while (!ok && attempts++ < 50);
  MP.greens.push({
    uid: MP.greenUid++,
    id: 'g' + MP.greenUid,
    x, y,
    hp: 3, sword: null, frozen: false,
    poisonTicks: 0, lastPoison: 0,
  });
}

function mpSpawnTriangle() {
  let x, y, ok;
  let attempts = 0;
  do {
    x = randomGrid(MP.MAP_W); y = randomGrid(MP.MAP_H);
    ok = true;
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - x) < MP.STEP && Math.abs(p.y - y) < MP.STEP) { ok = false; break; }
    }
  } while (!ok && attempts++ < 50);
  MP.triangles.push({
    id: 't' + Date.now() + Math.random(),
    x, y,
    hp: 5, frozen: false,
  });
}

function mpSpawnHeart() {
  let x, y, ok;
  let attempts = 0;
  do {
    x = randomGrid(MP.MAP_W); y = randomGrid(MP.MAP_H);
    ok = true;
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - x) < MP.STEP && Math.abs(p.y - y) < MP.STEP) { ok = false; break; }
    }
  } while (!ok && attempts++ < 50);
  MP.hearts.push({
    id: 'h' + Date.now() + Math.random(),
    x, y,
  });
}

function mpSpawnSword() {
  if (MP.wave < 1) return;
  if (MP.groundSwords.length >= 3) return;
  const avail = SWORD_TYPES_MP.filter(t => MP.wave >= t.minWave);
  const total = avail.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  let chosen = avail[0].type;
  for (const t of avail) { r -= t.weight; if (r <= 0) { chosen = t.type; break; } }
  let x, y, ok;
  let attempts = 0;
  do {
    x = randomGrid(MP.MAP_W); y = randomGrid(MP.MAP_H);
    ok = true;
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - x) < MP.STEP && Math.abs(p.y - y) < MP.STEP) { ok = false; break; }
    }
  } while (!ok && attempts++ < 50);
  MP.groundSwords.push({
    id: 's' + Date.now() + Math.random(),
    x, y,
    type: chosen,
  });
}

// ============ BOSS ============

const MP_BOSS_MAX_HP = 30;

function mpSpawnBoss() {
  let x, y, ok;
  let attempts = 0;
  do {
    x = randomGrid(MP.MAP_W - 60);
    y = randomGrid(MP.MAP_H - 60);
    ok = true;
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - x) < MP.STEP * 2 && Math.abs(p.y - y) < MP.STEP * 2) { ok = false; break; }
    }
  } while (!ok && attempts++ < 50);
  MP.boss = { x, y, hp: MP_BOSS_MAX_HP, hitAt: 0, frozen: 0, poisonTicks: 0, lastPoison: 0 };
}

function mpMoveBoss() {
  if (!MP.boss) return;
  const b = MP.boss;
  if (b.frozen && Date.now() - b.frozen < 3000) return;
  b.frozen = 0;
  const p = closestPlayer(b.x, b.y);
  if (!p) return;
  if (Math.abs(p.x + 15 - (b.x + 45)) < 60 && Math.abs(p.y + 15 - (b.y + 45)) < 60) {
    p.hp -= 10;
    return;
  }
  const step = 2;
  if (Math.abs(p.x + 15 - (b.x + 45)) >= Math.abs(p.y + 15 - (b.y + 45))) {
    if (p.x + 15 > b.x + 45) b.x += step;
    else if (p.x + 15 < b.x + 45) b.x -= step;
  } else {
    if (p.y + 15 > b.y + 45) b.y += step;
    else if (p.y + 15 < b.y + 45) b.y -= step;
  }
  b.x = Math.max(0, Math.min(MP.MAP_W - 90, b.x));
  b.y = Math.max(0, Math.min(MP.MAP_H - 90, b.y));
  if (Math.abs(p.x + 15 - (b.x + 45)) < 60 && Math.abs(p.y + 15 - (b.y + 45)) < 60) {
    p.hp -= 10;
  }
}

function mpSwordHitBoss(p) {
  const c = SWORD_CFG[p.sword];
  if (!c || !MP.boss) return;
  p.hp -= c.selfDmg;
  if (p.sword === 'life') p.hp = Math.min(p.hp + 2, 100);
  MP.boss.hp -= c.dmg;
  MP.boss.hitAt = Date.now();
  if (p.sword === 'ice') MP.boss.frozen = Date.now();
  if (p.sword === 'poison') { MP.boss.poisonTicks += 3; MP.boss.lastPoison = Date.now(); }
  if (p.sword === 'fire') {
    MP.boss.hp -= 2;
    const bx = MP.boss.x + 45;
    const by = MP.boss.y + 45;
    for (const gr of [...MP.greens]) {
      if (Math.abs(bx - (gr.x + 15)) < 60 && Math.abs(by - (gr.y + 15)) < 60) {
        gr.hp -= 2;
        gr.hitAt = Date.now();
        if (gr.hp <= 0) mpExplodeGreen(gr, false);
      }
    }
    for (const t of [...MP.triangles]) {
      if (Math.abs(bx - (t.x + 15)) < 60 && Math.abs(by - (t.y + 15)) < 60) {
        t.hp -= 2;
        t.hitAt = Date.now();
        if (t.hp <= 0) MP.triangles = MP.triangles.filter(e => e !== t);
      }
    }
  }
  if (MP.boss.hp <= 0) {
    MP.boss = null;
    MP.bossBullets = [];
    document.getElementById('boss-hp-bar').classList.remove('show');
    mpGameWin();
  }
}

function mpProcessBossEffects() {
  if (!MP.boss) return;
  const b = MP.boss;
  if (b.poisonTicks > 0 && Date.now() - b.lastPoison >= 1000) {
    b.hp--;
    if (b.hp <= 0) {
      MP.boss = null;
      MP.bossBullets = [];
      document.getElementById('boss-hp-bar').classList.remove('show');
      mpGameWin();
      return;
    }
    b.poisonTicks--;
    b.lastPoison = Date.now();
    b.hitAt = Date.now();
  }
}

function mpBossShoot() {
  if (!MP.boss) return;
  const b = MP.boss;
  const p = closestPlayer(b.x, b.y);
  if (!p) return;
  const dx = p.x + 15 - (b.x + 45);
  const dy = p.y + 15 - (b.y + 45);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const speed = 4;
  MP.bossBullets.push({
    id: ++MP.bossBulletUid,
    x: b.x + 45 - 14,
    y: b.y + 45 - 14,
    vx: dx / dist * speed,
    vy: dy / dist * speed,
  });
}

function mpMoveBossBullets() {
  for (const b of [...MP.bossBullets]) {
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < -30 || b.x > MP.MAP_W + 30 || b.y < -30 || b.y > MP.MAP_H + 30) {
      MP.bossBullets = MP.bossBullets.filter(e => e !== b);
      continue;
    }
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x + 15 - (b.x + 14)) < 20 && Math.abs(p.y + 15 - (b.y + 14)) < 20) {
        p.hp -= 5;
        MP.bossBullets = MP.bossBullets.filter(e => e !== b);
        break;
      }
    }
  }
}

function mpGameWin() {
  MP.started = false;
  broadcastMp({ type: 'gameWin' });
  mpStopIntervals();
  document.getElementById('boss-hp-bar').classList.remove('show');
  document.getElementById('game-over-box').querySelector('h1').textContent = 'Victoria!';
  document.getElementById('game-over-box').querySelector('p').innerHTML = 'Derrotaste al jefe final!';
  gameOverScreen.classList.add('show');
}

// ============ PROCESS PLAYER MOVE ============

function mpProcessMove(p, dir) {
  const step = p.slowed && Date.now() < p.slowed ? MP.STEP / 2 : MP.STEP;
  const oldX = p.x;
  const oldY = p.y;
  switch (dir) {
    case 'up': p.y -= step; break;
    case 'down': p.y += step; break;
    case 'left': p.x -= step; break;
    case 'right': p.x += step; break;
    default: return;
  }
  p.x = Math.max(0, Math.min(MP.MAP_W - 30, p.x));
  p.y = Math.max(0, Math.min(MP.MAP_H - 30, p.y));
  MP.trails.push({ x: oldX, y: oldY, color: p.color });

  for (const sw of [...MP.groundSwords]) {
    if (Math.abs(p.x - sw.x) < MP.STEP && Math.abs(p.y - sw.y) < MP.STEP) {
      p.sword = sw.type;
      MP.groundSwords = MP.groundSwords.filter(s => s !== sw);
      break;
    }
  }
  for (const h of [...MP.hearts]) {
    if (Math.abs(p.x - h.x) < MP.STEP && Math.abs(p.y - h.y) < MP.STEP) {
      p.hp = Math.min(p.hp + 5, 100);
      MP.hearts = MP.hearts.filter(e => e !== h);
      break;
    }
  }
  for (const gr of [...MP.greens]) {
    if (!MP.greens.includes(gr)) continue;
    if (Math.abs(p.x - gr.x) < MP.STEP && Math.abs(p.y - gr.y) < MP.STEP) {
      if (p.sword) mpSwordHitGreen(gr, p);
      else mpGreenCollide(gr, p);
    }
  }
  for (const t of [...MP.triangles]) {
    if (!MP.triangles.includes(t)) continue;
    if (Math.abs(p.x - t.x) < MP.STEP && Math.abs(p.y - t.y) < MP.STEP) {
      if (p.sword) mpSwordHitTriangle(t, p);
      else { p.hp -= 8; MP.triangles = MP.triangles.filter(e => e !== t); }
    }
  }
  if (MP.boss) {
    if (Math.abs(p.x + 15 - (MP.boss.x + 45)) < 60 && Math.abs(p.y + 15 - (MP.boss.y + 45)) < 60) {
      if (p.sword) mpSwordHitBoss(p);
    }
  }
  for (const b of [...MP.bossBullets]) {
    if (Math.abs(p.x + 15 - (b.x + 14)) < 20 && Math.abs(p.y + 15 - (b.y + 14)) < 20) {
      p.hp -= 5;
      MP.bossBullets = MP.bossBullets.filter(e => e !== b);
    }
  }
}

// ============ COMBAT ============

function mpSwordHitGreen(gr, p) {
  const c = SWORD_CFG[p.sword];
  if (!c) return;
  p.hp -= c.selfDmg;
  if (p.sword === 'life') p.hp = Math.min(p.hp + 2, 100);
  gr.hp -= c.dmg;
  gr.hitAt = Date.now();
  if (gr.hp <= 0) mpExplodeGreen(gr, p.sword === 'fire');
  else {
    if (p.sword === 'ice') gr.frozen = true;
    if (p.sword === 'poison') { gr.poisonTicks = 3; gr.lastPoison = Date.now(); }
  }
  if (p.sword === 'fire' && gr.hp > 0) {
    for (const n of [...MP.greens]) {
      if (n === gr) continue;
      if (Math.abs(gr.x - n.x) <= 60 && Math.abs(gr.y - n.y) <= 60) {
        n.hp -= 2;
        n.hitAt = Date.now();
        if (n.hp <= 0) mpExplodeGreen(n, false);
      }
    }
  }
  mpCheckWaveCleared();
}

function mpSwordHitTriangle(t, p) {
  const c = SWORD_CFG[p.sword];
  if (!c) return;
  p.hp -= c.selfDmg;
  if (p.sword === 'life') p.hp = Math.min(p.hp + 2, 100);
  t.hp -= c.dmg;
  t.hitAt = Date.now();
  if (t.hp <= 0) MP.triangles = MP.triangles.filter(e => e !== t);
}

function mpGreenCollide(gr, p) {
  gr.hitAt = Date.now();
  if (gr.sword === 'ice') {
    p.slowed = Date.now() + 2000;
    p.hp -= 8;
    MP.greens = MP.greens.filter(e => e !== gr);
  } else if (gr.sword === 'poison') {
    p.poisoned = { ticks: 3, lastTick: Date.now() };
    p.hp -= 5;
    MP.greens = MP.greens.filter(e => e !== gr);
  } else {
    p.hp -= 15;
    MP.greens = MP.greens.filter(e => e !== gr);
  }
  mpCheckWaveCleared();
}

function mpExplodeGreen(gr, isFire) {
  const cx = gr.x + 15;
  const cy = gr.y + 15;
  MP.greens = MP.greens.filter(e => e !== gr);
  MP.fx.push({ x: cx, y: cy, isFire, time: Date.now(), id: MP.greenUid + '-' + Date.now() });
  if (isFire) {
    for (const n of [...MP.greens]) {
      if (Math.abs(cx - 15 - n.x) <= 60 && Math.abs(cy - 15 - n.y) <= 60) {
        n.hp -= 2;
        n.hitAt = Date.now();
        if (n.hp <= 0) mpExplodeGreen(n, false);
      }
    }
    for (const p of Object.values(MP.players)) {
      if (Math.abs(p.x - (cx - 15)) <= 60 && Math.abs(p.y - (cy - 15)) <= 60) {
        p.hp -= 10;
      }
    }
  }
}

function mpCheckWaveCleared() {
  if (MP.wave === 10) {
    if (!MP.boss) {
      setTimeout(() => { if (MP.started) mpStartWave(); }, 2000);
    }
    return;
  }
  if (MP.greens.length === 0) {
    setTimeout(() => { if (MP.started) mpStartWave(); }, 2000);
  }
}

// ============ GAME LOOP ============

function closestPlayer(x, y) {
  let min = Infinity, cp = null;
  for (const p of Object.values(MP.players)) {
    if (p.hp <= 0) continue;
    const d = Math.abs(p.x - x) + Math.abs(p.y - y);
    if (d < min) { min = d; cp = p; }
  }
  return cp;
}

function mpMoveGreens() {
  const now = Date.now();
  for (const gr of [...MP.greens]) {
    if (!MP.greens.includes(gr)) continue;
    for (const z of MP.fireZones) {
      if (Math.abs(gr.x - z.x) <= MP.STEP * 1.5 && Math.abs(gr.y - z.y) <= MP.STEP * 1.5) {
        if (!z.lastDamaged) z.lastDamaged = {};
        if (!z.lastDamaged[gr.uid] || now - z.lastDamaged[gr.uid] >= 1000) {
          gr.hp -= 5;
          gr.hitAt = now;
          if (gr.hp <= 0) { mpExplodeGreen(gr, false); break; }
          z.lastDamaged[gr.uid] = now;
        }
      }
    }
    if (!MP.greens.includes(gr)) continue;
    if (gr.sword === 'life' && gr.hp < 5) gr.hp++;
    if (gr.poisonTicks > 0 && now - gr.lastPoison >= 1000) {
      gr.hp--;
      if (gr.hp <= 0) { mpExplodeGreen(gr, false); continue; }
      gr.poisonTicks--;
      gr.lastPoison = now;
    }
    if (gr.frozen) continue;
    const p = closestPlayer(gr.x, gr.y);
    if (!p) continue;
    if (Math.abs(p.x - gr.x) < MP.STEP && Math.abs(p.y - gr.y) < MP.STEP) {
      if (p.sword) mpSwordHitGreen(gr, p);
      else mpGreenCollide(gr, p);
      continue;
    }
    if (Math.abs(p.x - gr.x) >= Math.abs(p.y - gr.y)) {
      if (p.x > gr.x) gr.x += MP.STEP;
      else if (p.x < gr.x) gr.x -= MP.STEP;
    } else {
      if (p.y > gr.y) gr.y += MP.STEP;
      else if (p.y < gr.y) gr.y -= MP.STEP;
    }
    gr.x = Math.max(0, Math.min(MP.MAP_W - 30, gr.x));
    gr.y = Math.max(0, Math.min(MP.MAP_H - 30, gr.y));
    for (const sw of [...MP.groundSwords]) {
      if (gr.x === sw.x && gr.y === sw.y) {
        const bonus = sw.type === 'gold' ? 5 : (sw.type === 'ice' || sw.type === 'fire') ? 3 : 2;
        gr.sword = sw.type;
        gr.hp += bonus;
        MP.groundSwords = MP.groundSwords.filter(s => s !== sw);
        break;
      }
    }
    if (!MP.greens.includes(gr)) continue;
    if (Math.abs(p.x - gr.x) < MP.STEP && Math.abs(p.y - gr.y) < MP.STEP) {
      if (p.sword) mpSwordHitGreen(gr, p);
      else mpGreenCollide(gr, p);
    }
  }
}

function mpMoveTriangles() {
  for (const t of [...MP.triangles]) {
    if (!MP.triangles.includes(t)) continue;
    if (t.frozen) continue;
    const p = closestPlayer(t.x, t.y);
    if (!p) continue;
    if (Math.abs(p.x - t.x) < MP.STEP && Math.abs(p.y - t.y) < MP.STEP) {
      if (p.sword) mpSwordHitTriangle(t, p);
      else { p.hp -= 8; MP.triangles = MP.triangles.filter(e => e !== t); }
      continue;
    }
    if (Math.abs(p.x - t.x) >= Math.abs(p.y - t.y)) {
      if (p.x > t.x) t.x += MP.STEP;
      else if (p.x < t.x) t.x -= MP.STEP;
    } else {
      if (p.y > t.y) t.y += MP.STEP;
      else if (p.y < t.y) t.y -= MP.STEP;
    }
    t.x = Math.max(0, Math.min(MP.MAP_W - 30, t.x));
    t.y = Math.max(0, Math.min(MP.MAP_H - 30, t.y));
    if (!MP.triangles.includes(t)) continue;
    if (Math.abs(p.x - t.x) < MP.STEP && Math.abs(p.y - t.y) < MP.STEP) {
      if (p.sword) mpSwordHitTriangle(t, p);
      else { p.hp -= 8; MP.triangles = MP.triangles.filter(e => e !== t); }
    }
  }
}

function mpTriangleShoot() {
  for (const t of MP.triangles) {
    if (t.frozen) continue;
    const p = closestPlayer(t.x, t.y);
    if (!p) continue;
    const tx = t.x + 15, ty = t.y + 13;
    const dx = p.x + 15 - tx, dy = p.y + 15 - ty;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) continue;
    const speed = 5;
    MP.bullets.push({
      id: 'b' + (MP.bulletUid++),
      x: tx - 5, y: ty - 5,
      vx: dx / d * speed, vy: dy / d * speed,
    });
  }
}

function mpMoveBullets() {
  for (const b of [...MP.bullets]) {
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < -20 || b.x > MP.MAP_W + 20 || b.y < -20 || b.y > MP.MAP_H + 20) {
      MP.bullets = MP.bullets.filter(e => e !== b);
      continue;
    }
    for (const p of Object.values(MP.players)) {
      if (p.hp <= 0) continue;
      if (Math.abs(p.x + 15 - (b.x + 5)) < 15 && Math.abs(p.y + 15 - (b.y + 5)) < 15) {
        p.hp -= 5;
        MP.bullets = MP.bullets.filter(e => e !== b);
        break;
      }
    }
  }
}

function mpApplyEffects() {
  const now = Date.now();
  for (const p of Object.values(MP.players)) {
    if (p.poisoned && p.poisoned.ticks > 0 && now - p.poisoned.lastTick >= 1000) {
      p.hp--;
      p.poisoned.ticks--;
      p.poisoned.lastTick = now;
    }
  }
}

function mpHealPlayers() {
  for (const p of Object.values(MP.players)) {
    p.hp = Math.min(p.hp + 1, 100);
  }
}

function mpCheckGameOver() {
  for (const p of Object.values(MP.players)) {
    if (p.hp <= 0) {
      broadcastMp({ type: 'gameOver', wave: MP.wave });
      mpStopIntervals();
      MP.started = false;
      document.getElementById('boss-hp-bar').classList.remove('show');
      finalWave.textContent = MP.wave;
      gameOverScreen.classList.add('show');
      return;
    }
  }
}

function mpStartIntervals() {
  mpStopIntervals();
  MP.intervals.push(setInterval(() => { mpMoveGreens(); broadcastMpState(); }, 1500));
  MP.intervals.push(setInterval(() => { mpMoveTriangles(); broadcastMpState(); }, 1500));
  MP.intervals.push(setInterval(() => { mpTriangleShoot(); }, 2500));
  MP.intervals.push(setInterval(() => { mpMoveBullets(); broadcastMpState(); }, 50));
  MP.intervals.push(setInterval(() => { mpApplyEffects(); broadcastMpState(); }, 1000));
  MP.intervals.push(setInterval(() => { mpHealPlayers(); broadcastMpState(); }, 5000));
  MP.intervals.push(setInterval(() => { mpSpawnSword(); broadcastMpState(); }, 10000));
  MP.intervals.push(setInterval(() => { mpMoveBoss(); mpProcessBossEffects(); broadcastMpState(); }, 50));
  MP.intervals.push(setInterval(() => { mpBossShoot(); }, 2000));
  MP.intervals.push(setInterval(() => { mpMoveBossBullets(); broadcastMpState(); }, 50));
}

function mpStopIntervals() {
  for (const id of MP.intervals) clearInterval(id);
  MP.intervals = [];
}

// ============ STATE BROADCAST ============

function buildMpState() {
  const players = {};
  for (const [id, p] of Object.entries(MP.players)) {
    players[id] = {
      x: p.x, y: p.y, hp: p.hp, sword: p.sword,
      color: p.color, circleColor: p.circleColor, skin: p.skin, center: p.center,
    };
  }
  return {
    type: 'state',
    wave: MP.wave,
    players,
    greens: MP.greens.map(gr => ({
      id: gr.id, x: gr.x, y: gr.y, hp: gr.hp,
      sword: gr.sword, frozen: gr.frozen,
      hit: gr.hitAt && Date.now() - gr.hitAt < 150,
    })),
    triangles: MP.triangles.map(t => ({
      id: t.id, x: t.x, y: t.y, hp: t.hp, frozen: t.frozen,
      hit: t.hitAt && Date.now() - t.hitAt < 150,
    })),
    bullets: MP.bullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
    hearts: MP.hearts.map(h => ({ id: h.id, x: h.x, y: h.y })),
    groundSwords: MP.groundSwords.map(s => ({ id: s.id, x: s.x, y: s.y, type: s.type })),
    fireZones: MP.fireZones.map(z => ({ x: z.x, y: z.y })),
    boss: MP.boss ? { x: MP.boss.x, y: MP.boss.y, hp: MP.boss.hp, hit: MP.boss.hitAt && Date.now() - MP.boss.hitAt < 150 } : null,
    bossBullets: MP.bossBullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
    effects: MP.fx.splice(0),
    trails: MP.trails.splice(0),
  };
}

function broadcastMpState() {
  if (!MP.started) return;
  const state = buildMpState();
  broadcastMp(state);
  renderMpState(state);
  mpCheckGameOver();
}

function broadcastMp(data, exclude) {
  for (const c of MP.connections) {
    if (exclude && exclude.includes(c)) continue;
    c.send(data);
  }
}

// ============ CLIENT RENDERING ============

const SWORD_COLORS = {
  normal: '#95a5a6', gold: '#f1c40f', ice: '#5dade2',
  fire: '#e74c3c', life: '#1abc9c', poison: '#8e44ad',
};

function renderMpState(state) {
  const me = state.players[MP.myId];
  if (me) {
    square.style.left = me.x + 'px';
    square.style.top = me.y + 'px';
    square.style.backgroundColor = me.color;
    square.className = me.skin && me.skin !== 'solid' ? 'skin-' + me.skin : '';
    hp = me.hp;
    updateHealth();
    if (me.sword) {
      swordType = me.sword;
    } else {
      swordType = null;
    }
    updateSwordUI();
  }

  if (state.wave !== MP.wave) {
    MP.wave = state.wave;
    announceWave(MP.wave);
  }

  const others = document.getElementById('others-container');
  const existing = others.querySelectorAll('.other-player');
  for (const el of existing) {
    if (!state.players[el.dataset.peer]) el.remove();
  }
  for (const [id, p] of Object.entries(state.players)) {
    if (id === MP.myId) continue;
    let el = others.querySelector(`[data-peer="${id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'other-player';
      el.dataset.peer = id;
      others.appendChild(el);
    }
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.backgroundColor = p.color || '#f1c40f';
    el.className = 'other-player';
    if (p.skin && p.skin !== 'solid') el.classList.add('skin-' + p.skin);
    if (p.center && p.center !== 'circle') el.classList.add('center-' + p.center);
    el.style.setProperty('--circle-color', p.circleColor || 'rgba(255,255,255,0.5)');
    if (p.sword) {
      el.dataset.sword = p.sword;
      el.style.color = SWORD_COLORS[p.sword] || '#95a5a6';
    } else {
      delete el.dataset.sword;
    }
    let hpBar = el.querySelector('.hp-bar');
    if (!hpBar) {
      hpBar = document.createElement('div');
      hpBar.className = 'hp-bar';
      el.appendChild(hpBar);
    }
    let hpFill = hpBar.querySelector('.hp-bar-fill');
    if (!hpFill) {
      hpFill = document.createElement('div');
      hpFill.className = 'hp-bar-fill';
      hpBar.appendChild(hpFill);
    }
    hpFill.style.width = Math.max(0, p.hp) + '%';
  }

  greenContainer.innerHTML = '';
  for (const gr of state.greens) {
    const el = document.createElement('div');
    el.className = 'green-square';
    el.style.left = gr.x + 'px';
    el.style.top = gr.y + 'px';
    if (gr.frozen) el.classList.add('frozen');
    if (gr.hit) el.classList.add('hit');
    if (gr.sword) {
      el.classList.add(GREEN_ARMOR_CLASS[gr.sword] || 'armed');
      el.dataset.sword = gr.sword;
    }
    greenContainer.appendChild(el);
  }

  triangleContainer.innerHTML = '';
  for (const t of state.triangles) {
    const el = document.createElement('div');
    el.className = 'triangle-enemy';
    el.style.left = t.x + 'px';
    el.style.top = t.y + 'px';
    if (t.frozen) el.classList.add('frozen');
    if (t.hit) el.classList.add('hit');
    triangleContainer.appendChild(el);
  }

  swordContainer.innerHTML = '';
  for (const s of state.groundSwords) {
    const el = document.createElement('div');
    el.className = 'sword-item sword-' + s.type;
    el.dataset.swordType = s.type;
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    swordContainer.appendChild(el);
  }

  heartContainer.innerHTML = '';
  for (const h of state.hearts) {
    const el = document.createElement('div');
    el.className = 'heart';
    el.style.left = h.x + 'px';
    el.style.top = h.y + 'px';
    heartContainer.appendChild(el);
  }

  const trail = document.getElementById('trail-container');
  trail.querySelectorAll('.enemy-bullet').forEach(b => b.remove());
  for (const b of state.bullets) {
    const el = document.createElement('div');
    el.className = 'enemy-bullet';
    el.style.left = b.x + 'px';
    el.style.top = b.y + 'px';
    trail.appendChild(el);
  }

  trail.querySelectorAll('.fire-zone').forEach(f => f.remove());
  for (const z of state.fireZones) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const el = document.createElement('div');
        el.className = 'fire-zone';
        el.style.left = (z.x + dx * MP.STEP) + 'px';
        el.style.top = (z.y + dy * MP.STEP) + 'px';
        el.style.animationDelay = ((dx + 1) * 0.08 + (dy + 1) * 0.08) + 's';
        trail.appendChild(el);
      }
    }
  }

  trail.querySelectorAll('.boss').forEach(el => el.remove());
  const bossHpBar = document.getElementById('boss-hp-bar');
  const bossHpFill = document.getElementById('boss-hp-fill');
  const bossHpText = document.getElementById('boss-hp-text');
  if (state.boss) {
    const el = document.createElement('div');
    el.className = 'boss';
    el.style.left = state.boss.x + 'px';
    el.style.top = state.boss.y + 'px';

    const body = document.createElement('div');
    body.className = 'boss-body';
    if (state.boss.hit) body.classList.add('hit');
    el.appendChild(body);

    const hat = document.createElement('div'); hat.className = 'boss-hat';
    const band = document.createElement('div'); band.className = 'boss-hat-band';
    hat.appendChild(band);
    el.appendChild(hat);
    const bowtie = document.createElement('div'); bowtie.className = 'boss-bowtie';
    const knot = document.createElement('div'); knot.className = 'boss-bowtie-knot';
    bowtie.appendChild(knot);
    el.appendChild(bowtie);

    trail.appendChild(el);
    bossHpBar.classList.add('show');
    bossHpFill.style.width = Math.max(0, state.boss.hp / MP_BOSS_MAX_HP * 100) + '%';
    bossHpText.textContent = state.boss.hp + '/' + MP_BOSS_MAX_HP;
  } else {
    bossHpBar.classList.remove('show');
  }

  // boss bullets
  trail.querySelectorAll('.boss-bullet').forEach(b => b.remove());
  if (state.bossBullets) {
    for (const b of state.bossBullets) {
      const el = document.createElement('div');
      el.className = 'boss-bullet';
      el.style.left = b.x + 'px';
      el.style.top = b.y + 'px';
      trail.appendChild(el);
    }
  }

  // particle effects (explosions)
  if (state.effects) {
    for (const fx of state.effects) {
      for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        p.style.background = fx.isFire ? ['#ff4500','#ff6e40','#ffccbc','#fff'][Math.floor(Math.random()*4)] : '#fff';
        p.style.left = (fx.x - 4) + 'px';
        p.style.top = (fx.y - 4) + 'px';
        trail.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
      }
    }
  }

  if (state.trails) {
    for (const tr of state.trails) {
      const el = document.createElement('div');
      el.className = 'trail';
      el.style.left = tr.x + 'px';
      el.style.top = tr.y + 'px';
      el.style.background = tr.color;
      trail.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }
}

// ============ KEYBOARD HANDLER ============

function mpHandleKey(e) {
  const key = e.key;
  if (!MP.started) return;

  // ===== Q = ICE FREEZE =====
  if (key === 'q' || key === 'Q') {
    if (swordType !== 'ice') return;
    e.preventDefault();
    if (MP.isHost) {
      const me = MP.players[MP.myId];
      if (!me || me.sword !== 'ice') return;
      for (const g of MP.greens) g.frozen = true;
      for (const t of MP.triangles) t.frozen = true;
      me.sword = null;
      broadcastMpState();
    } else {
      MP.conn.send({ type: 'iceFreeze' });
    }
    return;
  }

  // ===== SHIFT = FIRE ZONE =====
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || key === 'Shift') {
    if (swordType !== 'fire') return;
    e.preventDefault();
    if (MP.isHost) {
      const me = MP.players[MP.myId];
      if (!me || me.sword !== 'fire') return;
      const zx = Math.round(me.x / MP.STEP) * MP.STEP;
      const zy = Math.round(me.y / MP.STEP) * MP.STEP;
      MP.fireZones.push({ x: zx, y: zy, time: Date.now(), lastDamaged: {} });
      me.sword = null;
      broadcastMpState();
    } else {
      MP.conn.send({ type: 'placeFire' });
    }
    return;
  }

  // ===== MOVEMENT =====
  const dirMap = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };
  const dir = dirMap[key];
  if (!dir) return;
  e.preventDefault();

  if (MP.isHost) {
    const me = MP.players[MP.myId];
    if (!me || me.hp <= 0) return;

    const step = me.slowed && Date.now() < me.slowed ? MP.STEP / 2 : MP.STEP;
    const oldX = me.x;
    const oldY = me.y;

    switch (dir) {
      case 'up':    me.y -= step; break;
      case 'down':  me.y += step; break;
      case 'left':  me.x -= step; break;
      case 'right': me.x += step; break;
    }
    me.x = Math.max(0, Math.min(MP.MAP_W - 30, me.x));
    me.y = Math.max(0, Math.min(MP.MAP_H - 30, me.y));

    // trail (estela)
    MP.trails.push({ x: oldX, y: oldY, color: square.style.backgroundColor || getComputedStyle(square).backgroundColor });

    // pickups & collisions (same as mpProcessMove)
    for (const sw of [...MP.groundSwords]) {
      if (Math.abs(me.x - sw.x) < MP.STEP && Math.abs(me.y - sw.y) < MP.STEP) {
        me.sword = sw.type;
        MP.groundSwords = MP.groundSwords.filter(s => s !== sw);
        break;
      }
    }
    for (const h of [...MP.hearts]) {
      if (Math.abs(me.x - h.x) < MP.STEP && Math.abs(me.y - h.y) < MP.STEP) {
        me.hp = Math.min(me.hp + 5, 100);
        MP.hearts = MP.hearts.filter(e => e !== h);
        break;
      }
    }
    for (const gr of [...MP.greens]) {
      if (!MP.greens.includes(gr)) continue;
      if (Math.abs(me.x - gr.x) < MP.STEP && Math.abs(me.y - gr.y) < MP.STEP) {
        if (me.sword) mpSwordHitGreen(gr, me);
        else mpGreenCollide(gr, me);
      }
    }
    for (const t of [...MP.triangles]) {
      if (!MP.triangles.includes(t)) continue;
      if (Math.abs(me.x - t.x) < MP.STEP && Math.abs(me.y - t.y) < MP.STEP) {
        if (me.sword) mpSwordHitTriangle(t, me);
        else { me.hp -= 8; MP.triangles = MP.triangles.filter(e => e !== t); }
      }
    }
    if (MP.boss) {
      if (Math.abs(me.x + 15 - (MP.boss.x + 45)) < 60 && Math.abs(me.y + 15 - (MP.boss.y + 45)) < 60) {
        if (me.sword) mpSwordHitBoss(me);
      }
    }
    for (const b of [...MP.bossBullets]) {
      if (Math.abs(me.x + 15 - (b.x + 14)) < 20 && Math.abs(me.y + 15 - (b.y + 14)) < 20) {
        me.hp -= 5;
        MP.bossBullets = MP.bossBullets.filter(e => e !== b);
      }
    }

    broadcastMpState();
  } else {
    // Client: send move to host → host broadcasts state back → client renders
    MP.conn.send({ type: 'move', dir });
  }
}

// ============ LEAVE GAME ============

function mpLeaveGame() {
  mpStopIntervals();
  if (MP.peer) MP.peer.destroy();
  MP.connections = [];
  MP.conn = null;
  MP.started = false;
  MP.players = {};
  MP.greens = [];
  MP.triangles = [];
  MP.bullets = [];
  MP.hearts = [];
  MP.groundSwords = [];
  MP.fireZones = [];
  MP.boss = null;
  MP.bossBullets = [];
  document.getElementById('boss-hp-bar').classList.remove('show');
  MP.wave = 0;
  MP.isHost = false;
  greenContainer.innerHTML = '';
  triangleContainer.innerHTML = '';
  swordContainer.innerHTML = '';
  heartContainer.innerHTML = '';
  document.getElementById('others-container').innerHTML = '';
  document.querySelectorAll('.enemy-bullet, .boss-bullet, .fire-zone, .trail, .particle, .boss').forEach(el => el.remove());
  stopParticles();
  location.reload();
}

// ============ PANEL MANAGEMENT ============

function showPanel(id) {
  document.querySelectorAll('.mp-panel').forEach(el => el.style.display = 'none');
  const panel = document.getElementById(id);
  if (panel) panel.style.display = 'block';
}

document.addEventListener('keydown', mpHandleKey);
