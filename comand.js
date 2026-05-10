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
let bossInterval = null;
let bossShootInterval = null;
let damageCooldown = false;
let greenHitCooldown = false;
let playerSlowed = false;
let playerPoison = { active: false, ticks: 0, lastTick: 0 };
let STEP = 30;
let mpMode = false;
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
  for (let i = 0; i < 500; i++) {
    const shape = i < 200 ? 0 : i < 350 ? 1 : 2;
    particles.push({
      x: Math.random() * (particleCanvas.width + 100) - 50,
      y: Math.random() * particleCanvas.height - particleCanvas.height,
      len: 8 + Math.random() * 18,
      size: shape === 0 ? 0 : 3 + Math.random() * 14,
      speedY: 4 + Math.random() * 10,
      speedX: -0.5 + Math.random() * 0.3,
      opacity: 0.15 + Math.random() * 0.5,
      wind: -0.4 + Math.random() * 0.2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.025,
      shape,
    });
  }
  function draw() {
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    ctx.lineWidth = 1;
    for (const p of particles) {
      p.y += p.speedY;
      p.x += p.wind;
      p.rot += p.rotSpeed;
      if (p.y > particleCanvas.height + 20) {
        p.y = -p.len - 20;
        p.x = Math.random() * (particleCanvas.width + 100) - 50;
      }
      if (p.x < -60) p.x = particleCanvas.width + 60;
      if (p.x > particleCanvas.width + 60) p.x = -60;
      ctx.globalAlpha = p.opacity;

      if (p.shape === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.wind * 5, p.y - p.len);
        ctx.stroke();
      } else if (p.shape === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        const s = p.size;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
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
  if (wave === 10) {
    spawnBoss();
    return;
  }
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
  if (wave === 10) {
    if (!document.querySelector('.boss')) {
      setTimeout(startWave, 2000);
    }
    return;
  }
  if (document.querySelectorAll('.green-square').length === 0) {
    setTimeout(startWave, 2000);
  }
}

let bossHp = 0;
const BOSS_MAX_HP = 30;

function spawnBoss() {
  const bx = Math.floor(Math.random() * (window.innerWidth - 90) / STEP) * STEP;
  const by = Math.floor(Math.random() * (window.innerHeight - 90) / STEP) * STEP;
  const el = document.createElement('div');
  el.className = 'boss';
  el.style.left = bx + 'px';
  el.style.top = by + 'px';
  el.dataset.hp = BOSS_MAX_HP;

  const body = document.createElement('div');
  body.className = 'boss-body';
  el.appendChild(body);
  const hat = document.createElement('div');
  hat.className = 'boss-hat';
  const band = document.createElement('div');
  band.className = 'boss-hat-band';
  hat.appendChild(band);
  el.appendChild(hat);
  const bowtie = document.createElement('div');
  bowtie.className = 'boss-bowtie';
  const knot = document.createElement('div');
  knot.className = 'boss-bowtie-knot';
  bowtie.appendChild(knot);
  el.appendChild(bowtie);

  container.appendChild(el);
  bossHp = BOSS_MAX_HP;

  const bossHpBar = document.getElementById('boss-hp-bar');
  const bossHpFill = document.getElementById('boss-hp-fill');
  const bossHpText = document.getElementById('boss-hp-text');
  bossHpBar.classList.add('show');
  bossHpFill.style.width = '100%';
  bossHpText.textContent = BOSS_MAX_HP + '/' + BOSS_MAX_HP;
  bossShootInterval = setInterval(bossShoot, 2000);
}

function swordHitBoss(el) {
  if (greenHitCooldown) return;
  greenHitCooldown = true;
  const config = SWORD_TYPES.find(s => s.type === swordType);
  if (!config) return;
  damagePlayer(config.selfDmg);
  if (config.type === 'life') healPlayer(2);
  let current = parseInt(el.dataset.hp);
  current -= config.dmg;
  el.dataset.hp = Math.max(0, current);

  const body = el.querySelector('.boss-body');
  if (body) { body.classList.add('hit'); setTimeout(() => body.classList.remove('hit'), 150); }

  if (config.type === 'ice') el.dataset.frozen = Date.now();
  if (config.type === 'poison') {
    el.dataset.poisonTicks = parseInt(el.dataset.poisonTicks || '0') + 3;
    el.dataset.lastPoison = Date.now();
  }
  if (config.type === 'fire') {
    current -= 2; el.dataset.hp = Math.max(0, current);
    const bx = parseInt(el.style.left) + 45;
    const by = parseInt(el.style.top) + 45;
    for (const g of document.querySelectorAll('.green-square')) {
      const gx = parseInt(g.style.left) + 15;
      const gy = parseInt(g.style.top) + 15;
      if (Math.abs(bx - gx) < 60 && Math.abs(by - gy) < 60) {
        let gh = parseInt(g.dataset.hp) - 2;
        if (gh <= 0) explode(g);
        else { g.dataset.hp = gh; g.classList.add('hit'); setTimeout(() => g.classList.remove('hit'), 150); }
      }
    }
    for (const t of document.querySelectorAll('.triangle-enemy')) {
      const tx = parseInt(t.style.left) + 15;
      const ty = parseInt(t.style.top) + 15;
      if (Math.abs(bx - tx) < 60 && Math.abs(by - ty) < 60) {
        let th = parseInt(t.dataset.hp) - 2;
        t.dataset.hp = Math.max(0, th);
        t.classList.add('hit'); setTimeout(() => t.classList.remove('hit'), 150);
        if (th <= 0) { t.remove(); }
      }
    }
  }

  updateBossHpBar();

  if (current <= 0) {
    el.remove();
    bossHp = 0;
    clearInterval(bossShootInterval);
    document.getElementById('boss-hp-bar').classList.remove('show');
    gameWin();
  }
  setTimeout(() => { greenHitCooldown = false; }, 200);
}

function updateBossHpBar() {
  const el = document.querySelector('.boss');
  if (!el) return;
  const fill = document.getElementById('boss-hp-fill');
  const txt = document.getElementById('boss-hp-text');
  const hp = Math.max(0, parseInt(el.dataset.hp));
  fill.style.width = (hp / BOSS_MAX_HP * 100) + '%';
  txt.textContent = hp + '/' + BOSS_MAX_HP;
}

function moveBoss() {
  const el = document.querySelector('.boss');
  if (!el) return;
  if (el.dataset.frozen) {
    if (Date.now() - parseInt(el.dataset.frozen) < 3000) return;
    delete el.dataset.frozen;
  }
  let bx = parseInt(el.style.left);
  let by = parseInt(el.style.top);
  const size = 90;
  if (Math.abs(x + 15 - (bx + 45)) < 60 && Math.abs(y + 15 - (by + 45)) < 60) {
    damagePlayer(10);
    return;
  }
  const step = 2;
  if (Math.abs(x + 15 - (bx + 45)) >= Math.abs(y + 15 - (by + 45))) {
    if (x + 15 > bx + 45) bx += step;
    else if (x + 15 < bx + 45) bx -= step;
  } else {
    if (y + 15 > by + 45) by += step;
    else if (y + 15 < by + 45) by -= step;
  }
  bx = Math.max(0, Math.min(window.innerWidth - size, bx));
  by = Math.max(0, Math.min(window.innerHeight - size, by));
  el.style.left = bx + 'px';
  el.style.top = by + 'px';
  if (Math.abs(x + 15 - (bx + 45)) < 60 && Math.abs(y + 15 - (by + 45)) < 60) {
    damagePlayer(10);
  }
}

function processBossEffects() {
  const el = document.querySelector('.boss');
  if (!el) return;
  const ticks = parseInt(el.dataset.poisonTicks);
  if (ticks && ticks > 0) {
    const now = Date.now();
    if (now - parseInt(el.dataset.lastPoison) >= 1000) {
      let hp = parseInt(el.dataset.hp) - 1;
      el.dataset.hp = Math.max(0, hp);
      el.dataset.poisonTicks = ticks - 1;
      el.dataset.lastPoison = now;
      const body = el.querySelector('.boss-body');
      if (body) { body.classList.add('hit'); setTimeout(() => body.classList.remove('hit'), 100); }
      updateBossHpBar();
      if (hp <= 0) {
        el.remove();
        bossHp = 0;
        clearInterval(bossShootInterval);
        document.getElementById('boss-hp-bar').classList.remove('show');
        gameWin();
      }
    }
  }
}

function gameWin() {
  started = false;
  clearInterval(moveInterval);
  clearInterval(bulletInterval);
  clearInterval(bossInterval);
  clearInterval(bossShootInterval);
  document.querySelectorAll('.boss-bullet').forEach(b => b.remove());
  document.getElementById('boss-hp-bar').classList.remove('show');
  document.getElementById('game-over-box').querySelector('h1').textContent = 'Victoria!';
  document.getElementById('game-over-box').querySelector('p').innerHTML = 'Derrotaste al jefe final!';
  gameOverScreen.classList.add('show');
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
    b.style.left = (tx - 5) + 'px';
    b.style.top = (ty - 5) + 'px';
    container.appendChild(b);
  }
}

function bossShoot() {
  const el = document.querySelector('.boss');
  if (!el) return;
  const bx = parseInt(el.style.left) + 45;
  const by = parseInt(el.style.top) + 45;
  const dx = x + 15 - bx;
  const dy = y + 15 - by;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const speed = 4;
  const b = document.createElement('div');
  b.className = 'boss-bullet';
  b.dataset.vx = dx / dist * speed;
  b.dataset.vy = dy / dist * speed;
  b.style.left = (bx - 14) + 'px';
  b.style.top = (by - 14) + 'px';
  container.appendChild(b);
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
    if (Math.abs(x + 15 - (bx + 5)) < 15 && Math.abs(y + 15 - (by + 5)) < 15) {
      damagePlayer(5);
      b.remove();
    }
  }
  const bossBullets = document.querySelectorAll('.boss-bullet');
  for (const b of bossBullets) {
    let bx = parseFloat(b.style.left) + parseFloat(b.dataset.vx);
    let by = parseFloat(b.style.top) + parseFloat(b.dataset.vy);
    if (bx < -30 || bx > window.innerWidth + 30 || by < -30 || by > window.innerHeight + 30) {
      b.remove(); continue;
    }
    b.style.left = bx + 'px';
    b.style.top = by + 'px';
    if (Math.abs(x + 15 - (bx + 14)) < 20 && Math.abs(y + 15 - (by + 14)) < 20) {
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
  const bossEl = document.querySelector('.boss');
  if (bossEl) {
    const bx = parseInt(bossEl.style.left);
    const by = parseInt(bossEl.style.top);
    if (Math.abs(x + 15 - (bx + 45)) < 60 && Math.abs(y + 15 - (by + 45)) < 60) {
      if (swordType) swordHitBoss(bossEl);
    }
  }
}

// ============ GAME OVER ============
function gameOver() {
  started = false;
  clearInterval(moveInterval);
  clearInterval(bulletInterval);
  clearInterval(bossInterval);
  clearInterval(bossShootInterval);
  document.querySelectorAll('.boss-bullet').forEach(b => b.remove());
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
const skinSelect = document.getElementById('skin-select');
const centerShape = document.getElementById('center-shape');

document.getElementById('customize-btn').addEventListener('click', () => {
  document.getElementById('customize-panel').classList.add('show');
  document.getElementById('start-box').classList.add('customizing');
});

function applyPlayerStyles() {
  const skin = skinSelect.value;
  const shape = centerShape.value;
  const bg = colorSquare.value;
  square.style.backgroundColor = bg;
  const classes = [];
  if (skin !== 'solid') classes.push('skin-' + skin);
  if (shape !== 'circle') classes.push('center-' + shape);
  square.className = classes.join(' ');
  square.style.setProperty('--circle-color', colorCircle.value);
}

colorSquare.addEventListener('input', applyPlayerStyles);
colorCircle.addEventListener('input', () => { square.style.setProperty('--circle-color', colorCircle.value); });
skinSelect.addEventListener('change', applyPlayerStyles);
centerShape.addEventListener('change', applyPlayerStyles);

applyPlayerStyles();

document.getElementById('customize-close').addEventListener('click', () => {
  document.getElementById('customize-panel').classList.remove('show');
  document.getElementById('start-box').classList.remove('customizing');
});

const mpBtn = document.getElementById('mp-btn');
const mpCreateBtn = document.getElementById('mp-create-btn');
const mpJoinBtn = document.getElementById('mp-join-btn');
const mpBackBtn = document.getElementById('mp-back-btn');
const mpStartBtn = document.getElementById('mp-start-btn');
const mpCancelBtn = document.getElementById('mp-cancel-btn');
const mpConnectBtn = document.getElementById('mp-connect-btn');
const mpBackJoinBtn = document.getElementById('mp-back-join-btn');
const mpLeaveBtn = document.getElementById('mp-leave-btn');
const mpRoomInput = document.getElementById('mp-room-input');

mpBtn.addEventListener('click', () => {
  mpMode = true;
  document.getElementById('mp-lobby').style.display = 'block';
  document.getElementById('start-btn').style.display = 'none';
  customizeBtn.style.display = 'none';
  document.getElementById('customize-panel').classList.remove('show');
  showPanel('mp-mode-select');
});

mpBackBtn.addEventListener('click', () => {
  if (MP.peer) MP.peer.destroy();
  MP.connections = [];
  MP.conn = null;
  MP.peer = null;
  MP.isHost = false;
  mpMode = false;
  document.getElementById('mp-lobby').style.display = 'none';
  document.getElementById('start-btn').style.display = '';
  customizeBtn.style.display = '';
});

mpCreateBtn.addEventListener('click', () => mpCreateRoom());
mpJoinBtn.addEventListener('click', () => showPanel('join-room'));
mpBackJoinBtn.addEventListener('click', () => showPanel('mp-mode-select'));
mpConnectBtn.addEventListener('click', () => {
  const code = mpRoomInput.value.trim();
  if (code) mpJoinRoom(code);
});
mpRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') mpConnectBtn.click();
});
mpStartBtn.addEventListener('click', () => mpHostStartGame());
mpCancelBtn.addEventListener('click', () => { mpLeaveGame(); });
mpLeaveBtn.addEventListener('click', () => { mpLeaveGame(); });

startBtn.addEventListener('click', () => {
  startScreen.style.display = 'none';
  started = true;
  startWave();
  setInterval(spawnRandomSword, 10000);
  moveInterval = setInterval(moveGreens, 1500);
  bulletInterval = setInterval(triangleShoot, 2500);
  setInterval(moveBullets, 50);
  setInterval(() => { if (started) healPlayer(1); }, 5000);
  bossInterval = setInterval(() => { moveBoss(); processBossEffects(); }, 50);
});

document.addEventListener('keydown', (e) => {
  if (!started) return;
  const key = e.key;

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
  trail.style.background = square.style.backgroundColor || getComputedStyle(square).backgroundColor;
  container.appendChild(trail);
  trail.addEventListener('animationend', () => trail.remove());
  square.style.left = x + 'px';
  square.style.top = y + 'px';
  checkCollisions();
});

startParticles();


