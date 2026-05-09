const square = document.getElementById('square');
const container = document.getElementById('trail-container');
const greenContainer = document.getElementById('green-container');
const swordContainer = document.getElementById('sword-container');
const heartContainer = document.getElementById('heart-container');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const healthFill = document.getElementById('health-fill');
const healthText = document.getElementById('health-text');
const swordInfo = document.getElementById('sword-info');
const waveAnnounce = document.getElementById('wave-announce');
const gameOverScreen = document.getElementById('game-over-screen');
const finalWave = document.getElementById('final-wave');
const restartBtn = document.getElementById('restart-btn');
const triangleContainer = document.getElementById('triangle-container');
const particleCanvas = document.getElementById('particle-canvas');

let x = square.offsetLeft;
let y = square.offsetTop;
let started = false;
let swordType = null;
let hp = 100;
const maxHp = 100;
let wave = 0;
let moveInterval = null;
let damageCooldown = false;
let greenHitCooldown = false;
let playerSlowed = false;
let playerPoison = { active: false, ticks: 0, lastTick: 0 };
let STEP = 30;
const GREEN_MAX_HP = 3;

const SWORD_TYPES = [
  { type: 'normal', uses: Infinity, dmg: 1, selfDmg: 3, minWave: 1, weight: 100, color: '#2c3e50' },
  { type: 'gold', uses: Infinity, dmg: 3, selfDmg: 1, minWave: 3, weight: 40, color: '#4a3000' },
  { type: 'ice', uses: Infinity, dmg: 1, selfDmg: 0, minWave: 4, weight: 30, color: '#1a5276' },
  { type: 'fire', uses: Infinity, dmg: 1, selfDmg: 2, minWave: 5, weight: 25, color: '#641e16' },
  { type: 'life', uses: Infinity, dmg: 1, selfDmg: 0, minWave: 5, weight: 20, color: '#0e6251' },
  { type: 'poison', uses: Infinity, dmg: 1, selfDmg: 2, minWave: 6, weight: 15, color: '#4a235a' },
];

const GREEN_ARMOR_CLASS = {
  normal: 'armed', gold: 'armed-gold', ice: 'armed-ice',
  fire: 'armed-fire', life: 'armed-life', poison: 'armed-poison',
};

// ============ PARTICLES ============
let particles = [];
let particleRAF = null;

function startParticles() {
  const ctx = particleCanvas.getContext('2d');
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  particles = [];
  const shapes = ['line', 'square', 'triangle'];
  for (let i = 0; i < 400; i++) {
    const shape = shapes[i < 160 ? 0 : i < 280 ? 1 : 2];
    particles.push({
      x: Math.random() * particleCanvas.width,
      y: Math.random() * particleCanvas.height,
      shape,
      len: 10 + Math.random() * 15,
      size: 3 + Math.random() * 4,
      speedY: 3 + Math.random() * 5,
      speedX: -0.5 + Math.random() * 0.3,
      opacity: 0.2 + Math.random() * 0.5,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
    });
  }
  function draw() {
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const p of particles) {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rot += p.rotSpeed;
      if (p.y > particleCanvas.height + p.len) { p.y = -p.len; p.x = Math.random() * particleCanvas.width; }
      if (p.x < -15) p.x = particleCanvas.width + 15;
      if (p.x > particleCanvas.width + 15) p.x = -15;
      ctx.globalAlpha = p.opacity;
      if (p.shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.speedX * 2, p.y - p.len);
        ctx.stroke();
      } else if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.shape === 'triangle') {
        const s = p.size;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(-s, s);
        ctx.lineTo(s, s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'text') {
        ctx.save();
        ctx.font = 'bold ' + (p.fontSize || 28) + 'px monospace';
        ctx.fillStyle = p.color || 'rgba(255,255,255,0.9)';
        ctx.shadowColor = p.color || '#fff';
        ctx.shadowBlur = 15;
        ctx.globalAlpha = p.opacity;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.digit, p.x, p.y);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    particleRAF = requestAnimationFrame(draw);
  }
  draw();
}

function stopParticles() {
  if (particleRAF) cancelAnimationFrame(particleRAF);
}

window.addEventListener('resize', () => {
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
});

// ============ SWORD SYSTEM ============
function getRandomSwordType() {
  const available = SWORD_TYPES.filter(s => wave >= s.minWave);
  const total = available.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const s of available) {
    r -= s.weight;
    if (r <= 0) return s.type;
  }
  return available[0].type;
}

let greenUid = 0;
let fireZones = [];

function updateSwordUI() {
  delete square.dataset.sword;
  if (swordType) {
    square.dataset.sword = swordType;
    const swordColors = { normal:'#95a5a6', gold:'#f1c40f', ice:'#5dade2', fire:'#e74c3c', life:'#1abc9c', poison:'#8e44ad' };
    square.style.color = swordColors[swordType] || '#95a5a6';
    swordInfo.textContent = swordType === 'normal' ? '🗡️ ∞' : '⚔️ ∞';
  } else {
    swordInfo.textContent = '';
    square.style.color = '';
  }
}

function updateHealth() {
  healthFill.style.width = Math.max(0, hp / maxHp * 100) + '%';
  healthText.textContent = Math.max(0, hp);
  if (hp <= 0) gameOver();
}

function announceWave(n) {
  waveAnnounce.textContent = 'Wave ' + n;
  waveAnnounce.classList.add('show');
  setTimeout(() => waveAnnounce.classList.remove('show'), 1500);
}

// ============ SINGLE PLAYER: SPAWN ============
function startWave() {
  wave++;
  announceWave(wave);
  const count = wave + 2;
  for (let i = 0; i < count; i++) spawnGreenSquare();
  if (wave >= 2) {
    const hc = Math.floor(wave / 2) + 1;
    for (let i = 0; i < hc; i++) spawnHeart();
  }
  if (wave >= 3) {
    const tc = Math.floor((wave - 1) / 2);
    for (let i = 0; i < tc; i++) spawnTriangleEnemy();
  }
  spawnRandomSword();
}

function checkWaveCleared() {
  if (document.querySelectorAll('.green-square').length === 0) {
    if (roomCode) { socket.emit('waveCleared'); }
    else { setTimeout(startWave, 2000); }
  }
}

function spawnGreenSquare() {
  const maxX = window.innerWidth - 30;
  const maxY = window.innerHeight - 30;
  const gx = Math.floor(Math.random() * maxX / STEP) * STEP;
  const gy = Math.floor(Math.random() * maxY / STEP) * STEP;
  const el = document.createElement('div');
  el.className = 'green-square';
  el.dataset.hp = GREEN_MAX_HP;
  el.dataset.uid = greenUid++;
  el.style.left = gx + 'px';
  el.style.top = gy + 'px';
  greenContainer.appendChild(el);
  pickupSword(el);
}

function spawnRandomSword() {
  if (wave < 1) return;
  const swords = document.querySelectorAll('.sword-item');
  if (swords.length >= 3) return;
  const type = getRandomSwordType();
  const maxX = window.innerWidth - 30;
  const maxY = window.innerHeight - 30;
  const sx = Math.floor(Math.random() * maxX / STEP) * STEP;
  const sy = Math.floor(Math.random() * maxY / STEP) * STEP;
  const el = document.createElement('div');
  el.className = 'sword-item sword-' + type;
  el.dataset.swordType = type;
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  swordContainer.appendChild(el);
}

function spawnHeart() {
  const maxX = window.innerWidth - 30;
  const maxY = window.innerHeight - 30;
  const hx = Math.floor(Math.random() * maxX / STEP) * STEP;
  const hy = Math.floor(Math.random() * maxY / STEP) * STEP;
  const el = document.createElement('div');
  el.className = 'heart';
  el.style.left = hx + 'px';
  el.style.top = hy + 'px';
  heartContainer.appendChild(el);
}

// ============ GREEN DEATH ============
function explode(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + 15;
  const cy = rect.top + 15;
  const isFire = el.dataset.sword === 'fire';
  el.remove();
  if (isFire) {
    const nearby = document.querySelectorAll('.green-square');
    for (const n of nearby) {
      const nx = parseInt(n.style.left);
      const ny = parseInt(n.style.top);
      if (Math.abs(cx - 15 - nx) <= 60 && Math.abs(cy - 15 - ny) <= 60) {
        let nhp = parseInt(n.dataset.hp) - 2;
        if (nhp <= 0) { explode(n); }
        else { n.dataset.hp = nhp; n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 150); }
      }
    }
    if (Math.abs(x - (cx - 15)) <= 60 && Math.abs(y - (cy - 15)) <= 60) {
      damagePlayer(10);
    }
  }
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 120;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    p.style.background = isFire ? ['#ff4500','#ff6e40','#ffccbc','#fff'][Math.floor(Math.random()*4)] : '#fff';
    p.style.left = (cx - 4) + 'px';
    p.style.top = (cy - 4) + 'px';
    container.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

// ============ PLAYER EFFECTS ============
function damagePlayer(amount) {
  if (damageCooldown) return;
  damageCooldown = true;
  hp = Math.max(0, hp - amount);
  updateHealth();
  setTimeout(() => { damageCooldown = false; }, 500);
}

function healPlayer(amount) {
  hp = Math.min(maxHp, hp + amount);
  updateHealth();
}

function applyPlayerPoison() {
  if (!playerPoison.active) return;
  const now = Date.now();
  if (now - playerPoison.lastTick >= 1000) {
    damagePlayer(1);
    playerPoison.ticks--;
    playerPoison.lastTick = now;
    if (playerPoison.ticks <= 0) playerPoison.active = false;
  }
}

// ============ SWORD HIT GREEN ============
function swordHitGreen(g) {
  if (greenHitCooldown) return;
  greenHitCooldown = true;
  const config = SWORD_TYPES.find(s => s.type === swordType);
  if (!config) return;
  damagePlayer(config.selfDmg);
  if (config.type === 'life') healPlayer(2);
  let current = parseInt(g.dataset.hp);
  current -= config.dmg;
  g.classList.add('hit');
  setTimeout(() => g.classList.remove('hit'), 150);
  if (config.type === 'ice') {
    g.dataset.frozen = 'true';
    g.classList.add('frozen');
    setTimeout(() => {
      delete g.dataset.frozen;
      g.classList.remove('frozen');
    }, 3000);
  }
  if (config.type === 'poison') {
    g.dataset.poisonTicks = 3;
    g.dataset.lastPoison = Date.now();
  }
  if (current <= 0) {
    explode(g);
  } else {
    g.dataset.hp = current;
  }
  if (config.type === 'fire' && current > 0) {
    const gx = parseInt(g.style.left);
    const gy = parseInt(g.style.top);
    const nearby = document.querySelectorAll('.green-square');
    for (const n of nearby) {
      if (n === g) continue;
      const nx = parseInt(n.style.left);
      const ny = parseInt(n.style.top);
      if (Math.abs(gx - nx) <= 60 && Math.abs(gy - ny) <= 60) {
        let nhp = parseInt(n.dataset.hp) - 2;
        if (nhp <= 0) { explode(n); }
        else { n.dataset.hp = nhp; n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 150); }
      }
    }
  }
  checkWaveCleared();
  setTimeout(() => { greenHitCooldown = false; }, 200);
}

// ============ GREEN PICKUP SWORD ============
function pickupSword(g) {
  const gx = parseInt(g.style.left);
  const gy = parseInt(g.style.top);
  const items = document.querySelectorAll('.sword-item');
  for (const s of items) {
    const sx = parseInt(s.style.left);
    const sy = parseInt(s.style.top);
    if (gx === sx && gy === sy) {
      const st = s.dataset.swordType;
      const bonus = st === 'gold' ? 5 : st === 'ice' || st === 'fire' ? 3 : 2;
      s.remove();
      g.dataset.sword = st;
      g.dataset.hp = parseInt(g.dataset.hp) + bonus;
      g.classList.remove('armed', 'armed-gold', 'armed-ice', 'armed-fire', 'armed-life', 'armed-poison');
      g.classList.add(GREEN_ARMOR_CLASS[st] || 'armed');
      return;
    }
  }
}

function processGreenEffects() {
  const greens = document.querySelectorAll('.green-square');
  const now = Date.now();
  for (const g of greens) {
    for (const zone of fireZones) {
      const gx = parseInt(g.style.left);
      const gy = parseInt(g.style.top);
      if (Math.abs(gx - zone.x) <= STEP * 1.5 && Math.abs(gy - zone.y) <= STEP * 1.5) {
        if (!zone.lastDamaged) zone.lastDamaged = {};
        if (!zone.lastDamaged[g.dataset.uid] || now - zone.lastDamaged[g.dataset.uid] >= 1000) {
          let hpVal = parseInt(g.dataset.hp) - 5;
          if (hpVal <= 0) { explode(g); checkWaveCleared(); break; }
          else { g.dataset.hp = hpVal; g.classList.add('hit'); setTimeout(() => g.classList.remove('hit'), 150); }
          zone.lastDamaged[g.dataset.uid] = now;
        }
      }
    }
    if (!g.parentNode) continue;
    if (g.dataset.sword === 'life') {
      let hpVal = parseInt(g.dataset.hp);
      if (hpVal < GREEN_MAX_HP + 2) { g.dataset.hp = hpVal + 1; }
    }
    if (g.dataset.poisonTicks && parseInt(g.dataset.poisonTicks) > 0) {
      if (now - parseInt(g.dataset.lastPoison) >= 1000) {
        let hpVal = parseInt(g.dataset.hp) - 1;
        if (hpVal <= 0) { explode(g); checkWaveCleared(); continue; }
        g.dataset.hp = hpVal;
        g.dataset.poisonTicks = parseInt(g.dataset.poisonTicks) - 1;
        g.dataset.lastPoison = now;
        g.classList.add('hit');
        setTimeout(() => g.classList.remove('hit'), 100);
      }
    }
  }
}

// ============ FIRE ZONE / ICE FREEZE (single player) ============
function placeFireZone() {
  if (swordType === 'ice') {
    swordType = null;
    updateSwordUI();
    const greens = document.querySelectorAll('.green-square');
    for (const g of greens) {
      g.dataset.frozen = 'true';
      g.classList.add('frozen');
    }
    const tris = document.querySelectorAll('.triangle-enemy');
    for (const t of tris) {
      t.dataset.frozen = 'true';
      t.classList.add('frozen');
    }
    return;
  }
  if (swordType !== 'fire') return;
  const zx = Math.round(x / STEP) * STEP;
  const zy = Math.round(y / STEP) * STEP;
  const zone = { x: zx, y: zy, time: Date.now(), lastDamaged: {} };
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tile = document.createElement('div');
      tile.className = 'fire-zone';
      tile.style.left = (zx + dx * STEP) + 'px';
      tile.style.top = (zy + dy * STEP) + 'px';
      tile.style.animationDelay = ((dx + 1) * 0.08 + (dy + 1) * 0.08) + 's';
      container.appendChild(tile);
      zone.elements = zone.elements || [];
      zone.elements.push(tile);
    }
  }
  fireZones.push(zone);
  swordType = null;
  updateSwordUI();
}

// ============ TRIANGLE ENEMIES (single player) ============
let bulletInterval = null;

function spawnTriangleEnemy() {
  const maxX = window.innerWidth - 30;
  const maxY = window.innerHeight - 30;
  const tx = Math.floor(Math.random() * maxX / STEP) * STEP;
  const ty = Math.floor(Math.random() * maxY / STEP) * STEP;
  const el = document.createElement('div');
  el.className = 'triangle-enemy';
  el.dataset.hp = 5;
  el.style.left = tx + 'px';
  el.style.top = ty + 'px';
  triangleContainer.appendChild(el);
}

function triangleShoot() {
  const tris = document.querySelectorAll('.triangle-enemy');
  for (const t of tris) {
    if (t.dataset.frozen === 'true') continue;
    const tx = parseInt(t.style.left) + 15;
    const ty = parseInt(t.style.top) + 13;
    const dx = x + 15 - tx;
    const dy = y + 15 - ty;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;
    const speed = 5;
    const b = document.createElement('div');
    b.className = 'enemy-bullet';
    b.dataset.vx = dx / dist * speed;
    b.dataset.vy = dy / dist * speed;
    b.style.left = (tx - 4) + 'px';
    b.style.top = (ty - 4) + 'px';
    container.appendChild(b);
  }
}

function moveBullets() {
  const bullets = document.querySelectorAll('.enemy-bullet');
  for (const b of bullets) {
    let bx = parseFloat(b.style.left) + parseFloat(b.dataset.vx);
    let by = parseFloat(b.style.top) + parseFloat(b.dataset.vy);
    if (bx < -20 || bx > window.innerWidth + 20 || by < -20 || by > window.innerHeight + 20) {
      b.remove(); continue;
    }
    b.style.left = bx + 'px';
    b.style.top = by + 'px';
    if (Math.abs(x + 15 - (bx + 4)) < 15 && Math.abs(y + 15 - (by + 4)) < 15) {
      damagePlayer(5);
      b.remove();
    }
  }
}

// ============ TRIANGLE SWORD HIT (single player) ============
function swordHitTriangle(t) {
  if (greenHitCooldown) return;
  greenHitCooldown = true;
  const config = SWORD_TYPES.find(s => s.type === swordType);
  if (!config) return;
  damagePlayer(config.selfDmg);
  if (config.type === 'life') healPlayer(2);
  let current = parseInt(t.dataset.hp);
  current -= config.dmg;
  t.classList.add('hit');
  setTimeout(() => t.classList.remove('hit'), 150);
  if (config.type === 'ice') {
    t.dataset.frozen = 'true';
    t.classList.add('frozen');
    setTimeout(() => {
      delete t.dataset.frozen;
      t.classList.remove('frozen');
    }, 3000);
  }
  t.dataset.hp = Math.max(0, current);
  if (current <= 0) {
    const rect = t.getBoundingClientRect();
    const cx = rect.left + 15;
    const cy = rect.top + 15;
    t.remove();
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 100;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      p.style.background = '#f1c40f';
      p.style.left = (cx - 4) + 'px';
      p.style.top = (cy - 4) + 'px';
      container.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }
  setTimeout(() => { greenHitCooldown = false; }, 200);
}

// ============ MOVE GREENS (single player) ============
function moveGreens() {
  processGreenEffects();
  applyPlayerPoison();
  const tris = document.querySelectorAll('.triangle-enemy');
  for (const t of tris) {
    if (t.dataset.frozen === 'true') continue;
    let tx = parseInt(t.style.left);
    let ty = parseInt(t.style.top);
    if (Math.abs(x - tx) < STEP && Math.abs(y - ty) < STEP) {
      if (swordType) { swordHitTriangle(t); }
      else { damagePlayer(8); t.remove(); }
      continue;
    }
    if (Math.abs(x - tx) >= Math.abs(y - ty)) {
      if (x > tx) tx += STEP;
      else if (x < tx) tx -= STEP;
    } else {
      if (y > ty) ty += STEP;
      else if (y < ty) ty -= STEP;
    }
    tx = Math.max(0, Math.min(window.innerWidth - 30, tx));
    ty = Math.max(0, Math.min(window.innerHeight - 30, ty));
    t.style.left = tx + 'px';
    t.style.top = ty + 'px';
    if (Math.abs(x - tx) < STEP && Math.abs(y - ty) < STEP) {
      if (swordType) { swordHitTriangle(t); }
      else { damagePlayer(8); t.remove(); }
    }
  }
  const greens = document.querySelectorAll('.green-square');
  for (const g of greens) {
    if (g.dataset.frozen === 'true') continue;
    let gx = parseInt(g.style.left);
    let gy = parseInt(g.style.top);
    if (Math.abs(x - gx) < STEP && Math.abs(y - gy) < STEP) {
      if (swordType) { swordHitGreen(g); }
      else { handleGreenCollision(g); }
      continue;
    }
    if (Math.abs(x - gx) >= Math.abs(y - gy)) {
      if (x > gx) gx += STEP;
      else if (x < gx) gx -= STEP;
    } else {
      if (y > gy) gy += STEP;
      else if (y < gy) gy -= STEP;
    }
    gx = Math.max(0, Math.min(window.innerWidth - 30, gx));
    gy = Math.max(0, Math.min(window.innerHeight - 30, gy));
    g.style.left = gx + 'px';
    g.style.top = gy + 'px';
    pickupSword(g);
    if (Math.abs(x - gx) < STEP && Math.abs(y - gy) < STEP) {
      if (swordType) { swordHitGreen(g); }
      else { handleGreenCollision(g); }
    }
  }
}

function handleGreenCollision(g) {
  const sword = g.dataset.sword;
  if (sword === 'ice' && !playerSlowed) {
    playerSlowed = true;
    STEP = 15;
    damagePlayer(8);
    setTimeout(() => { playerSlowed = false; STEP = 30; }, 2000);
    g.remove();
    checkWaveCleared();
    return;
  }
  if (sword === 'poison') {
    playerPoison = { active: true, ticks: 3, lastTick: Date.now() };
    damagePlayer(5);
    g.remove();
    checkWaveCleared();
    return;
  }
  damagePlayer(15);
  g.remove();
  checkWaveCleared();
}

// ============ CHECK COLLISIONS (single player) ============
function checkCollisions() {
  const items = document.querySelectorAll('.sword-item');
  for (const s of items) {
    const sx = parseInt(s.style.left);
    const sy = parseInt(s.style.top);
    if (Math.abs(x - sx) < STEP && Math.abs(y - sy) < STEP) {
      const st = s.dataset.swordType;
      const config = SWORD_TYPES.find(t => t.type === st);
      if (config) {
        s.remove();
        swordType = st;
        updateSwordUI();
      }
    }
  }
  const hearts = document.querySelectorAll('.heart');
  for (const h of hearts) {
    const hx = parseInt(h.style.left);
    const hy = parseInt(h.style.top);
    if (Math.abs(x - hx) < STEP && Math.abs(y - hy) < STEP) {
      h.remove();
      healPlayer(5);
    }
  }
  const greens = document.querySelectorAll('.green-square');
  for (const g of greens) {
    const gx = parseInt(g.style.left);
    const gy = parseInt(g.style.top);
    if (Math.abs(x - gx) < STEP && Math.abs(y - gy) < STEP) {
      if (swordType) { swordHitGreen(g); }
      else { handleGreenCollision(g); }
    }
  }
  const tris = document.querySelectorAll('.triangle-enemy');
  for (const t of tris) {
    const tx = parseInt(t.style.left);
    const ty = parseInt(t.style.top);
    if (Math.abs(x - tx) < STEP && Math.abs(y - ty) < STEP) {
      if (swordType) { swordHitTriangle(t); }
      else { damagePlayer(8); t.remove(); }
    }
  }
}

// ============ GAME OVER ============
function gameOver() {
  started = false;
  clearInterval(moveInterval);
  clearInterval(bulletInterval);
  finalWave.textContent = wave;
  gameOverScreen.classList.add('show');
}

function restart() { location.reload(); }

restartBtn.addEventListener('click', restart);

const customizeBtn = document.getElementById('customize-btn');
const customizePanel = document.getElementById('customize-panel');
const customizeClose = document.getElementById('customize-close');
const colorSquare = document.getElementById('color-square');
const colorCircle = document.getElementById('color-circle');

customizeBtn.addEventListener('click', () => customizePanel.classList.toggle('show'));
customizeClose.addEventListener('click', () => customizePanel.classList.remove('show'));

function applyColors() {
  square.style.background = colorSquare.value;
  square.style.setProperty('--circle-color', colorCircle.value);
}
colorSquare.addEventListener('input', () => {
  applyColors();
  if (roomCode) socket.emit('updateColor', colorSquare.value);
});
colorCircle.addEventListener('input', () => {
  applyColors();
  if (roomCode) socket.emit('updateCircleColor', colorCircle.value);
});

startBtn.addEventListener('click', () => {
  if (roomCode) { socket.emit('startGame'); return; }
  startScreen.style.display = 'none';
  started = true;
  startWave();
  setInterval(spawnRandomSword, 10000);
  moveInterval = setInterval(moveGreens, 1500);
  bulletInterval = setInterval(triangleShoot, 2500);
  setInterval(moveBullets, 50);
  setInterval(() => { if (started) healPlayer(1); }, 5000);
});

document.addEventListener('keydown', (e) => {
  if (!started) return;
  const key = e.key;

  // === MULTIPLAYER KEY HANDLING ===
  if (roomCode) {
    if (key === 'q' || key === 'Q') {
      socket.emit('iceFreeze');
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || key === 'Shift') {
      e.preventDefault();
      socket.emit('placeFire');
      return;
    }
    const dirMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    const dir = dirMap[key];
    if (!dir) return;
    e.preventDefault();
    socket.emit('playerMove', dir);
    return;
  }

  // === SINGLE PLAYER KEY HANDLING ===
  if (key === 'q' || key === 'Q') {
    if (swordType === 'ice') { e.preventDefault(); placeFireZone(); return; }
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || key === 'Shift') {
    if (swordType === 'fire') { e.preventDefault(); placeFireZone(); return; }
  }
  const dir = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }[key];
  if (!dir) return;
  e.preventDefault();
  const oldX = x;
  const oldY = y;
  switch (dir) {
    case 'up':    y -= STEP; break;
    case 'down':  y += STEP; break;
    case 'left':  x -= STEP; break;
    case 'right': x += STEP; break;
  }
  const trail = document.createElement('div');
  trail.className = 'trail';
  trail.style.left = oldX + 'px';
  trail.style.top = oldY + 'px';
  trail.style.background = square.style.background || getComputedStyle(square).background;
  container.appendChild(trail);
  trail.addEventListener('animationend', () => trail.remove());
  square.style.left = x + 'px';
  square.style.top = y + 'px';
  checkCollisions();
});

startParticles();

// ============ MULTIPLAYER ============
const socket = io();
const othersContainer = document.getElementById('others-container');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const lobbyStatus = document.getElementById('lobby-status');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeBig = document.getElementById('room-code-big');
let roomCode = null;
let otherPlayers = {};
let lastState = null;

createRoomBtn.addEventListener('click', () => {
  createRoomBtn.disabled = true;
  createRoomBtn.textContent = 'Creando...';
  socket.emit('createRoom');
});

joinRoomBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim();
  if (code.length === 4) {
    joinRoomBtn.disabled = true;
    joinRoomBtn.textContent = 'Conectando...';
    socket.emit('joinRoom', code);
  } else {
    lobbyStatus.textContent = '⚠️ Ingresa un código de 4 números';
  }
});

socket.on('roomCreated', (code) => {
  roomCode = code;
  roomCodeInput.value = code;
  roomCodeBig.textContent = code;
  roomCodeDisplay.style.display = 'block';
  lobbyStatus.textContent = '🟢 Esperando jugadores...';
  createRoomBtn.textContent = '✅ Sala creada';
  spawnCodeParticles(code);
});

socket.on('roomJoined', (code) => {
  roomCode = code;
  lobbyStatus.textContent = '✅ Conectado a la sala';
  roomCodeInput.value = code;
  joinRoomBtn.textContent = '✅ Conectado';
  spawnCodeParticles(code);
});

socket.on('joinError', (msg) => {
  lobbyStatus.textContent = '❌ ' + msg;
  joinRoomBtn.disabled = false;
  joinRoomBtn.textContent = '🔗 Unirse';
});

socket.on('playerJoined', () => {
  lobbyStatus.textContent = '👤 Un jugador se conectó';
});
socket.on('playerLeft', () => {
  lobbyStatus.textContent = '👤 Un jugador se desconectó';
});

function spawnCodeParticles(code) {
  const digits = code.split('');
  const colors = ['#2ecc71', '#3498db', '#e74c3c', '#f1c40f'];
  const cx = particleCanvas.width / 2 - 120;
  const cy = particleCanvas.height / 2;
  for (let i = 0; i < digits.length; i++) {
    particles.push({
      x: cx + i * 80,
      y: cy + (Math.random() - 0.5) * 40,
      shape: 'text',
      digit: digits[i],
      fontSize: 48,
      speedY: 0.5 + Math.random() * 0.3,
      speedX: (Math.random() - 0.5) * 0.2,
      opacity: 0.8,
      rot: 0,
      rotSpeed: 0,
      color: colors[i],
    });
  }
}

// ============ MULTIPLAYER STATE RENDER ============
const GREEN_CLASS_MAP = {
  normal: 'armed', gold: 'armed-gold', ice: 'armed-ice',
  fire: 'armed-fire', life: 'armed-life', poison: 'armed-poison',
};

let prevPlayerPos = null;

function renderMultiplayerState(state) {
  lastState = state;
  const me = state.players[socket.id];
  if (!me) return;

  // Trail
  if (prevPlayerPos && (prevPlayerPos.x !== me.x || prevPlayerPos.y !== me.y)) {
    const trail = document.createElement('div');
    trail.className = 'trail';
    trail.style.left = prevPlayerPos.x + 'px';
    trail.style.top = prevPlayerPos.y + 'px';
    trail.style.background = square.style.background || getComputedStyle(square).background;
    container.appendChild(trail);
    trail.addEventListener('animationend', () => trail.remove());
  }
  prevPlayerPos = { x: me.x, y: me.y };

  // Position
  square.style.left = me.x + 'px';
  square.style.top = me.y + 'px';

  // HP
  hp = me.hp;
  healthFill.style.width = Math.max(0, me.hp / maxHp * 100) + '%';
  healthText.textContent = Math.max(0, me.hp);

  // Sword
  if (me.sword !== swordType) {
    swordType = me.sword;
    updateSwordUI();
  }

  // Wave announce
  if (state.wave > wave) {
    wave = state.wave;
    announceWave(wave);
  }

  // Other players
  othersContainer.innerHTML = '';
  for (const [id, p] of Object.entries(state.players)) {
    if (id === socket.id) continue;
    const el = document.createElement('div');
    el.id = 'other-' + id;
    el.className = 'other-player';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    if (p.color) el.style.background = p.color;
    if (p.sword) {
      el.dataset.sword = p.sword;
      const swordColors = { normal:'#95a5a6', gold:'#f1c40f', ice:'#5dade2', fire:'#e74c3c', life:'#1abc9c', poison:'#8e44ad' };
      el.style.color = swordColors[p.sword] || '#95a5a6';
    } else {
      delete el.dataset.sword;
    }
    othersContainer.appendChild(el);
  }

  // Greens
  greenContainer.innerHTML = '';
  for (const gr of state.greens) {
    const el = document.createElement('div');
    el.className = 'green-square';
    if (gr.frozen) el.classList.add('frozen');
    if (gr.sword) el.classList.add(GREEN_CLASS_MAP[gr.sword] || 'armed');
    el.style.left = gr.x + 'px';
    el.style.top = gr.y + 'px';
    el.dataset.sid = gr.id;
    greenContainer.appendChild(el);
  }

  // Triangles
  triangleContainer.innerHTML = '';
  for (const t of state.triangles) {
    const el = document.createElement('div');
    el.className = 'triangle-enemy';
    if (t.frozen) el.classList.add('frozen');
    el.style.left = t.x + 'px';
    el.style.top = t.y + 'px';
    triangleContainer.appendChild(el);
  }

  // Bullets
  container.querySelectorAll('.enemy-bullet').forEach(el => el.remove());
  for (const b of state.bullets) {
    const el = document.createElement('div');
    el.className = 'enemy-bullet';
    el.style.left = b.x + 'px';
    el.style.top = b.y + 'px';
    container.appendChild(el);
  }

  // Hearts
  heartContainer.innerHTML = '';
  for (const h of state.hearts) {
    const el = document.createElement('div');
    el.className = 'heart';
    el.style.left = h.x + 'px';
    el.style.top = h.y + 'px';
    heartContainer.appendChild(el);
  }

  // Ground swords
  swordContainer.innerHTML = '';
  for (const s of state.groundSwords) {
    const el = document.createElement('div');
    el.className = 'sword-item sword-' + s.type;
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    swordContainer.appendChild(el);
  }

  // Fire zones
  container.querySelectorAll('.fire-zone').forEach(el => el.remove());
  for (const z of state.fireZones) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tile = document.createElement('div');
        tile.className = 'fire-zone';
        tile.style.left = (z.x + dx * STEP) + 'px';
        tile.style.top = (z.y + dy * STEP) + 'px';
        container.appendChild(tile);
      }
    }
  }
}

socket.on('gameStarted', () => {
  startScreen.style.display = 'none';
  started = true;
  socket.emit('updateColor', colorSquare.value);
  socket.emit('updateCircleColor', colorCircle.value);
});

socket.on('gameState', (state) => {
  if (!started || !roomCode) return;
  renderMultiplayerState(state);
  if (state.players[socket.id] && state.players[socket.id].hp <= 0) {
    started = false;
    finalWave.textContent = state.wave;
    gameOverScreen.classList.add('show');
  }
});

socket.on('gameOver', (waveNum) => {
  started = false;
  finalWave.textContent = waveNum;
  gameOverScreen.classList.add('show');
});
