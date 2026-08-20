const canvas = document.querySelector('#fireworks');
const ctx = canvas.getContext('2d');
const scene = document.querySelector('.scene');
const countEl = document.querySelector('#launchCount');
const statusEl = document.querySelector('#statusText');
const autoButton = document.querySelector('#autoButton');
const autoLabel = document.querySelector('#autoLabel');
const clearButton = document.querySelector('#clearButton');
const shapeOptions = [...document.querySelectorAll('.shape-option')];
const textInput = document.querySelector('#textInput');
const versionTag = document.querySelector('#versionTag');
const versionOptions = [...document.querySelectorAll('.version-option')];
const shapePicker = document.querySelector('.shape-picker');
const collabPanel = document.querySelector('#collabPanel');
const connectionDot = document.querySelector('#connectionDot');
const connectionText = document.querySelector('#connectionText');
const usernameInput = document.querySelector('#usernameInput');
const joinButton = document.querySelector('#joinButton');
const roomControls = document.querySelector('#roomControls');
const roomInput = document.querySelector('#roomInput');
const roomPasswordInput = document.querySelector('#roomPasswordInput');
const createRoomButton = document.querySelector('#createRoomButton');
const roomHint = document.querySelector('#roomHint');
const mergeRule = document.querySelector('#mergeRule');
const mergeDebug = document.querySelector('#mergeDebug');
const mergeDebugDetail = document.querySelector('#mergeDebugDetail');
const lobbyPanel = document.querySelector('#lobbyPanel');
const chatInput = document.querySelector('#chatInput');
const sendChatButton = document.querySelector('#sendChatButton');
const danmakuLayer = document.querySelector('#danmakuLayer');
const editorPanel = document.querySelector('#editorPanel');
const workGallery = document.querySelector('#workGallery');
const workList = document.querySelector('#workList');
const workShape = document.querySelector('#workShape');
const workText = document.querySelector('#workText');
const workColor = document.querySelector('#workColor');
const workSize = document.querySelector('#workSize');
const workSpeed = document.querySelector('#workSpeed');
const saveWorkButton = document.querySelector('#saveWorkButton');
const shareWorkButton = document.querySelector('#shareWorkButton');
const testWorkButton = document.querySelector('#testWorkButton');
const aiPanel = document.querySelector('#aiPanel');
const aiPrompt = document.querySelector('#aiPrompt');
const aiFireworkButton = document.querySelector('#aiFireworkButton');
const aiTextButton = document.querySelector('#aiTextButton');
const aiThemeButton = document.querySelector('#aiThemeButton');
const aiResult = document.querySelector('#aiResult');
const workStatus = document.querySelector('#workStatus');
const replyNotice = document.querySelector('#replyNotice');
const replyNoticeTitle = document.querySelector('#replyNoticeTitle');
const replyNoticeText = document.querySelector('#replyNoticeText');
const intro = document.querySelector('.intro');
const galaxyPanel = document.querySelector('#galaxyPanel');
const galaxyDate = document.querySelector('#galaxyDate');
const galaxyCompute = document.querySelector('#galaxyCompute');
const galaxyStatus = document.querySelector('#galaxyStatus');
const galaxyPreview = document.querySelector('#galaxyPreview');
const galaxyMeta = document.querySelector('#galaxyMeta');
const galaxyLaunch = document.querySelector('#galaxyLaunch');
const galaxyTest = document.querySelector('#galaxyTest');
const galaxyBack = document.querySelector('#galaxyBack');

let width = 0, height = 0, dpr = 1, launches = 0, auto = false, autoTimer, currentVersion = 2, audioEnabled = true;
const MAX_ROCKETS = 64, MAX_PARTICLES = 2400, MAX_LABELS = 40, MAX_MERGE_BURSTS = 8;
let galaxyState = null, galaxyPoints = [], galaxyTestNext = false, galaxyWatchTimer = 0;
let rockets = [], particles = [], labels = [], mergeBursts = [], stars = [], lastTime = performance.now(), selectedShape = 'random';
let eventSource = null, clientId = '', username = '烟花玩家', roomId = '', roomToken = '', replyTarget = '', testNextWork = false, editorPoints = [], savedWorks = loadWorks();
const palette = ['#ffb55b', '#ff7168', '#f7e58c', '#9ae1ff', '#d09cff', '#ff91c8'];
let audioContext;

function playSound(type = 'burst') {
  if (!audioEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime, osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type === 'launch' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(type === 'launch' ? 180 : 115, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'launch' ? 420 : 48, now + (type === 'launch' ? .22 : .55));
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'launch' ? .055 : .13, now + .015); gain.gain.exponentialRampToValueAtTime(.0001, now + (type === 'launch' ? .24 : .65));
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + (type === 'launch' ? .25 : .7));
  } catch (_) { /* 音频不可用时仍保持视觉体验 */ }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth; height = window.innerHeight;
  canvas.width = width * dpr; canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars = Array.from({ length: Math.max(80, Math.floor(width * height / 8500)) }, () => ({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.2 + .2, a: Math.random() * .5 + .1 }));
}

function launch(x = width * (.25 + Math.random() * .55), y = height * (.25 + Math.random() * .44), options = {}) {
  if (rockets.length >= MAX_ROCKETS) return;
  const color = palette[Math.floor(Math.random() * palette.length)];
  const owner = options.owner || username;
  const galaxy = options.shape === 'galaxy';
  const stage = galaxy ? fireworkStage() : null;
  rockets.push({ x: galaxy ? stage.cx : x, y: height + 12, targetX: galaxy ? stage.cx : x + (Math.random() - .5) * 100, targetY: galaxy ? stage.cy : y, speed: (280 + Math.random() * 120) * (options.speed || 1), color: options.color || color, size: galaxy ? 1 : (.7 + Math.random() * 1.2) * (options.size || 1), trail: [], id: options.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, shape: currentVersion === 1 ? 'burst' : (options.shape || selectedShape), text: options.text || textInput.value.trim() || '嗨', points: options.points || [], owner, remote: Boolean(options.remote) });
  playSound('launch');
  launches++; countEl.textContent = launches;
}

function emitParticle(particle) { if (particles.length < MAX_PARTICLES) particles.push(particle); }
function emitLabel(label) { if (labels.length < MAX_LABELS) labels.push(label); }
function emitMergeBurst(burst) { if (mergeBursts.length < MAX_MERGE_BURSTS) mergeBursts.push(burst); }

function explode(rocket) {
  let shape = currentVersion === 1 ? 'burst' : rocket.shape;
  if (shape === 'random') shape = ['star', 'heart', 'burst', ...(rocket.text ? ['text'] : [])][Math.floor(Math.random() * 4)];
  const amount = Math.floor(78 + Math.random() * 45), mode = shape === 'burst' ? 0 : shape === 'star' ? 1 : shape === 'heart' ? 2 : 3;
  const rings = shape === 'burst' ? 2 : 1;
  playSound('burst');
  if (shape !== 'galaxy') emitLabel({ x: rocket.targetX, y: rocket.targetY - 12, text: rocket.owner || '烟花玩家', color: rocket.remote ? '#9ae1ff' : '#ffb55b', life: 1 });
  if (shape === 'galaxy') { addGalaxyParticles(rocket); return; }
  if (shape === 'custom') { addPointParticles(rocket); return; }
  if (shape === 'text') { addTextParticles(rocket); return; }
  for (let ring = 0; ring < rings; ring++) {
    const total = Math.floor(amount / rings);
    for (let i = 0; i < total; i++) {
      let angle = (Math.PI * 2 * i / total) + (ring * .12), speed = (mode === 2 ? 70 : 105 + Math.random() * 100) * (ring ? 1.23 : 1) * rocket.size;
      if (shape === 'star') { const points = 5, point = i % (points * 2); angle = (Math.PI * 2 * Math.floor(i / (points * 2)) / points) + (point * Math.PI / points); speed = (point % 2 ? 70 : 150) * rocket.size; }
      if (shape === 'heart') { const t = Math.PI * 2 * i / total; const hx = 16 * Math.pow(Math.sin(t), 3), hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)); angle = Math.atan2(hy, hx); speed = Math.hypot(hx, hy) * 6.2 * rocket.size; }
      emitParticle({ x: rocket.targetX, y: rocket.targetY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: .34 + Math.random() * .28, size: Math.random() * 1.5 + 1, color: mode === 3 && i % 3 ? '#fff5c4' : rocket.color, twinkle: mode === 3 });
    }
  }
  for (let i = 0; i < 20; i++) emitParticle({ x: rocket.targetX, y: rocket.targetY, vx: (Math.random() - .5) * 45, vy: (Math.random() - .5) * 45, life: 1, decay: .8 + Math.random() * .5, size: Math.random() * 2 + 1, color: '#fff4d1', twinkle: false });
}

function addTextParticles(rocket) {
  const off = document.createElement('canvas'), size = Math.max(42, Math.min(92, width / 8)); off.width = 360; off.height = 150;
  const offCtx = off.getContext('2d'); offCtx.fillStyle = '#fff'; offCtx.font = `700 ${size}px Manrope, sans-serif`; offCtx.textAlign = 'center'; offCtx.textBaseline = 'middle'; offCtx.fillText(rocket.text, 180, 75);
  const data = offCtx.getImageData(0, 0, off.width, off.height).data;
  for (let y = 0; y < off.height; y += 5) for (let x = 0; x < off.width; x += 5) if (data[(y * off.width + x) * 4 + 3] > 80) emitParticle({ x: rocket.targetX + (x - 180) * .7, y: rocket.targetY + (y - 75) * .7, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, life: 1, decay: .18 + Math.random() * .1, size: 1.5 + Math.random() * 1.1, color: rocket.color, twinkle: true, anchored: true });
}

function fillPointCloud(rawPoints) {
  const source = Array.isArray(rawPoints) ? rawPoints.filter(point => Array.isArray(point) && point.length >= 2).map(point => [Number(point[0]) || 0, Number(point[1]) || 0]) : [];
  const filled = source.slice();
  const rows = new Map();
  source.forEach(point => { const row = Math.round((point[1] + 1) * 42); if (!rows.has(row)) rows.set(row, []); rows.get(row).push(point[0]); });
  rows.forEach((xs, row) => {
    if (xs.length < 2) return;
    const min = Math.min(...xs), max = Math.max(...xs); if (max - min < .025) return;
    const y = row / 42 - 1; const count = Math.min(40, Math.max(2, Math.ceil((max - min) / .035)));
    for (let i = 0; i <= count; i++) filled.push([min + (max - min) * i / count, y]);
  });
  return filled.slice(0, 900);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function parseGalaxyDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day, date };
}

const GALAXY_PALETTE = { core: ['#fff6d0', '#ffe49b'], mid: ['#d7e4ff', '#b7c9ff'], arm: ['#9eb6ff', '#7ea8ff'], name: '冰蓝旋臂' };

function computeGalaxyState(input = galaxyDate.value) {
  const parsed = parseGalaxyDate(input);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
  const phase = (dayOfYear - 201) / 365.25 * Math.PI * 2;
  const visibility = (Math.cos(phase) + 1) / 2;
  const core = Math.round(48 + visibility * 46);
  const season = visibility < .25 ? '银河中心较隐约' : visibility < .5 ? '银河中心隐约可见' : visibility < .75 ? '银河拱起，核心较亮' : '银河中心高悬，核心明亮';
  const seed = ((year * 73856093) ^ (month * 19349663) ^ (day * 83492791)) >>> 0;
  const rng = mulberry32(seed);
  const arms = 2 + Math.floor(rng() * 3);
  const winding = 2.4 + rng() * 3.4;
  const inclination = .18 + rng() * .72;
  const rotation = rng() * Math.PI * 2;
  const chirality = rng() > .5 ? 1 : -1;
  const bar = rng() > .62;
  const spread = .08 + rng() * .18 + (1 - core / 100) * .06;
  const bulgeRatio = .14 + rng() * .22;
  const pointCount = 280 + Math.floor(rng() * 260) + Math.round(visibility * 40);
  const morph = arms === 2 ? '双臂螺旋' : arms === 3 ? '三臂螺旋' : '多臂螺旋';
  return {
    year, month, day, dayOfYear, visibility, core, season, pointCount, seed, label: String(day),
    arms, winding, inclination, rotation, chirality, bar, spread, bulgeRatio,
    morph: `${morph}${bar ? '·核棒' : ''}`
  };
}

function projectGalaxyPoint(x, y, inclination, angle) {
  const flattened = y * Math.cos(inclination);
  return [x * Math.cos(angle) - flattened * Math.sin(angle), x * Math.sin(angle) + flattened * Math.cos(angle)];
}

function generateGalaxyPoints(state) {
  const rng = mulberry32(state.seed ^ 0x9e3779b9);
  const points = [];
  const { arms, winding, inclination, rotation, chirality, bar, spread, bulgeRatio, pointCount } = state;
  const bulge = Math.floor(pointCount * bulgeRatio);
  for (let i = 0; i < bulge; i++) {
    const theta = rng() * Math.PI * 2;
    const radius = Math.pow(rng(), 1.35 + state.visibility) * (.12 + bulgeRatio * .35);
    const squash = .55 + rng() * .4;
    points.push(projectGalaxyPoint(radius * Math.cos(theta), radius * Math.sin(theta) * squash, inclination, rotation));
  }
  if (bar) {
    const barCount = Math.floor(pointCount * .08);
    for (let i = 0; i < barCount; i++) {
      const t = (rng() - .5) * 2;
      const x = t * (.22 + rng() * .08);
      const y = (rng() - .5) * (.04 + rng() * .03);
      points.push(projectGalaxyPoint(x, y, inclination, rotation));
    }
  }
  const armStart = points.length;
  for (let i = armStart; i < pointCount; i++) {
    const arm = i % arms;
    const t = Math.pow(rng(), .48 + rng() * .28);
    const theta = chirality * (t * winding * Math.PI + (arm * Math.PI * 2) / arms) + (rng() - .5) * spread * (1 + t);
    const radius = .05 + t * (.78 + rng() * .22);
    const jitter = .018 + t * (.04 + spread * .35);
    const x = radius * Math.cos(theta) + (rng() - .5) * jitter;
    const y = radius * Math.sin(theta) + (rng() - .5) * jitter * .85;
    points.push(projectGalaxyPoint(x, y, inclination, rotation));
  }
  let maxR = .001;
  points.forEach(point => { maxR = Math.max(maxR, Math.hypot(point[0], point[1])); });
  return points.map(point => [point[0] / maxR, point[1] / maxR]);
}

function galaxyColor(radius, rng) {
  if (radius < .12) return GALAXY_PALETTE.core[rng() > .4 ? 0 : 1];
  if (radius < .3) return GALAXY_PALETTE.mid[rng() > .5 ? 0 : 1];
  return GALAXY_PALETTE.arm[rng() > .35 ? 0 : 1];
}

function drawGalaxyPreview() {
  if (!galaxyPreview || !galaxyPoints.length) return;
  const ctxPreview = galaxyPreview.getContext('2d');
  const w = galaxyPreview.width, h = galaxyPreview.height;
  ctxPreview.fillStyle = '#000'; ctxPreview.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, scale = Math.min(w, h) * .42;
  const rng = mulberry32((galaxyState?.seed || 1) ^ 0x85ebca6b);
  galaxyPoints.forEach(point => {
    const radius = Math.hypot(point[0], point[1]);
    ctxPreview.globalAlpha = .4 + (1 - radius) * (.35 + (galaxyState?.visibility || .5) * .35);
    ctxPreview.fillStyle = galaxyColor(radius, rng);
    ctxPreview.beginPath();
    ctxPreview.arc(cx + point[0] * scale, cy + point[1] * scale, radius < .1 ? 1.9 : 1.2, 0, Math.PI * 2);
    ctxPreview.fill();
  });
  ctxPreview.globalAlpha = 1;
}

function formatGalaxyDate(state) {
  return `${state.year}-${String(state.month).padStart(2, '0')}-${String(state.day).padStart(2, '0')}`;
}

function applyGalaxyState(state) {
  galaxyState = state;
  galaxyPoints = generateGalaxyPoints(state);
  const palette = GALAXY_PALETTE;
  const tilt = state.inclination < .3 ? '近正视' : state.inclination > .7 ? '近侧视' : '斜视';
  galaxyStatus.textContent = `已生成 ${formatGalaxyDate(state)} 的银河状态，点击“立即放出”观看像素银河`;
  galaxyMeta.textContent = `银河季节：${state.season} · ${state.morph} · ${tilt} · ${palette.name} · 核心亮度 ${state.core}% · 点阵 ${galaxyPoints.length} 点 · 默认按北半球午夜模型推算`;
  drawGalaxyPreview();
  statusEl.textContent = `版本 10 · ${formatGalaxyDate(state)} 银河已就绪`;
}

function computeAndRenderGalaxy() {
  const state = computeGalaxyState();
  if (!state) { galaxyStatus.textContent = '请输入有效的生日年月日'; return false; }
  applyGalaxyState(state);
  galaxyCompute.textContent = '已推算';
  window.clearTimeout(computeAndRenderGalaxy.timer);
  computeAndRenderGalaxy.timer = window.setTimeout(() => { galaxyCompute.textContent = '推算银河'; }, 900);
  return true;
}

function fireworkStage() {
  const panel = galaxyPanel?.getBoundingClientRect();
  const left = currentVersion === 10 && panel && !galaxyPanel.hidden ? Math.min(panel.right + 18, width * .56) : width * .18;
  const top = 150;
  const right = width - 28;
  const bottom = height - 72;
  const stageWidth = Math.max(220, right - left);
  const stageHeight = Math.max(220, bottom - top);
  return { left, top, width: stageWidth, height: stageHeight, cx: left + stageWidth / 2, cy: top + stageHeight / 2 };
}

function launchGalaxyFirework() {
  if (!galaxyState && !computeAndRenderGalaxy()) return;
  const stage = fireworkStage();
  rockets = []; particles = []; labels = []; mergeBursts = [];
  galaxyStatus.textContent = `正在夜空放出 ${formatGalaxyDate(galaxyState)} 的像素银河`;
  statusEl.textContent = '像素银河正在绽放';
  launch(stage.cx, stage.cy, { shape: 'galaxy', points: galaxyPoints, color: '#9eb6ff', size: 1, speed: 1.15, text: galaxyState.label, owner: formatGalaxyDate(galaxyState) });
}

function setGalaxyWatching(watching) {
  document.body.classList.toggle('galaxy-watching', watching);
  galaxyBack.hidden = !watching;
  window.clearTimeout(galaxyWatchTimer);
  if (watching) galaxyWatchTimer = window.setTimeout(() => setGalaxyWatching(false), 7800);
}

function addGalaxyParticles(rocket) {
  const points = Array.isArray(rocket.points) && rocket.points.length ? rocket.points : galaxyPoints;
  const stage = fireworkStage();
  const scale = Math.min(stage.width, stage.height) * .46;
  const rng = mulberry32((galaxyState?.seed || Date.now()) ^ 12345);
  emitLabel({ x: rocket.targetX, y: rocket.targetY + 8, text: rocket.text || galaxyState?.label || '', color: '#e8a060', life: 3.2, galaxy: true });
  points.forEach(point => {
    if (!Array.isArray(point) || point.length < 2) return;
    const tx = rocket.targetX + Number(point[0]) * scale;
    const ty = rocket.targetY + Number(point[1]) * scale * .9;
    const radius = Math.hypot(point[0], point[1]);
    emitParticle({ x: rocket.targetX, y: rocket.targetY, tx, ty, vx: (tx - rocket.targetX) * 1.6, vy: (ty - rocket.targetY) * 1.6, life: 1, decay: .1 + rng() * .04, size: radius < .12 ? 2.8 : 1.9 + rng() * .9, color: galaxyColor(radius, rng), twinkle: true, galaxy: true });
  });
  for (let i = 0; i < 18; i++) emitParticle({ x: rocket.targetX, y: rocket.targetY, vx: (rng() - .5) * 50, vy: (rng() - .5) * 50, life: 1, decay: .55 + rng() * .25, size: 1 + rng() * 1.2, color: '#fff6d0', twinkle: true });
}

function addPointParticles(rocket) {
  const points = fillPointCloud(rocket.points);
  points.forEach(point => {
    if (!Array.isArray(point) || point.length < 2) return;
    emitParticle({ x: rocket.targetX + Number(point[0]) * 135 * rocket.size, y: rocket.targetY + Number(point[1]) * 135 * rocket.size, vx: (Math.random() - .5) * 12, vy: (Math.random() - .5) * 12, life: 1, decay: .2 + Math.random() * .12, size: 1.4 + Math.random() * 1.5, color: rocket.color, twinkle: true });
  });
  for (let i = 0; i < 35; i++) emitParticle({ x: rocket.targetX, y: rocket.targetY, vx: (Math.random() - .5) * 70, vy: (Math.random() - .5) * 70, life: 1, decay: .6 + Math.random() * .3, size: 1 + Math.random() * 1.5, color: '#fff4d1', twinkle: true });
}

function triggerMegaBurst(x, y, names, ids = []) {
  rockets = rockets.filter(rocket => !ids.includes(rocket.id));
  const color = '#ffe49b';
  const safeNames = names && names.length > 1 ? names : ['用户 A', '用户 B'];
  emitLabel({ x, y: y - 28, text: `${safeNames[0]}  +  ${safeNames[1]}`, color, life: 1.7, mega: true });
  emitMergeBurst({ x, y, life: 1, color });
  playSound('burst');
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 110; i++) {
    const angle = Math.PI * 2 * i / 110 + ring * .13;
    const speed = (ring === 0 ? 165 : ring === 1 ? 225 : 285) * (.85 + Math.random() * .3);
    emitParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.15, decay: .2 + ring * .07 + Math.random() * .1, size: 1.3 + Math.random() * (ring + 1), color: ring === 1 ? '#fff6c9' : ring === 2 ? '#ffb55b' : color, twinkle: true });
  }
  for (let i = 0; i < 80; i++) emitParticle({ x, y, vx: (Math.random() - .5) * 90, vy: (Math.random() - .5) * 90, life: 1, decay: .7 + Math.random() * .3, size: 1.5 + Math.random() * 2, color: '#fff', twinkle: true });
}

function showMergeDebug(data) {
  const names = data.names || ['用户 A', '用户 B'];
  mergeDebugDetail.textContent = `${names[0]} + ${names[1]} · 距离 ${Math.round(data.distance || 0)}px · ${data.deltaMs || 0}ms 内`;
  mergeDebug.hidden = false;
  statusEl.textContent = '合并成功 · 大型烟花';
  window.clearTimeout(showMergeDebug.timer);
  showMergeDebug.timer = window.setTimeout(() => { mergeDebug.hidden = true; }, 2600);
}

function clearSky() { rockets = []; particles = []; labels = []; mergeBursts = []; launches = 0; countEl.textContent = '0'; statusEl.textContent = currentVersion === 10 ? '版本 10 · 夜空已清空' : '夜空已清空'; setGalaxyWatching(false); }

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, .035); lastTime = now;
  if (document.hidden) { requestAnimationFrame(loop); return; }
  ctx.fillStyle = 'rgba(5, 5, 10, .19)'; ctx.fillRect(0, 0, width, height);
  stars.forEach(s => { ctx.globalAlpha = s.a * (.7 + Math.sin(now / 900 + s.x) * .3); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; const dx = r.targetX - r.x, dy = r.targetY - r.y; const dist = Math.hypot(dx, dy); const step = r.speed * dt;
    r.trail.push({ x: r.x, y: r.y }); if (r.trail.length > 7) r.trail.shift();
    r.x += dx / dist * step; r.y += dy / dist * step;
    r.trail.forEach((p, n) => { ctx.globalAlpha = n / r.trail.length * .45; ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(p.x, p.y, (n + 1) * .35, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1; ctx.shadowBlur = 14; ctx.shadowColor = r.color; ctx.fillStyle = '#fff4d1'; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (dist < 10) { explode(r); rockets.splice(i, 1); statusEl.textContent = '正在绽放'; }
  }
  const particleGlow = particles.length < 900;
  let particleWrite = 0; ctx.shadowBlur = particleGlow ? 8 : 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.galaxy) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tx != null) { p.vx += (p.tx - p.x) * 7.5 * dt; p.vy += (p.ty - p.y) * 7.5 * dt; }
      p.vx *= Math.pow(.05, dt); p.vy *= Math.pow(.05, dt); p.life -= p.decay * dt;
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.12, dt); p.vy = p.vy * Math.pow(.12, dt) + 33 * dt; p.life -= p.decay * dt;
    }
    if (p.life <= 0) continue;
    particles[particleWrite++] = p;
    ctx.globalAlpha = Math.max(0, p.life) * (p.twinkle ? (.65 + Math.random() * .35) : 1); ctx.fillStyle = p.color; if (particleGlow) ctx.shadowColor = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life + .25), 0, Math.PI * 2); ctx.fill();
  }
  particles.length = particleWrite; ctx.shadowBlur = 0;
  let mergeWrite = 0;
  for (let i = 0; i < mergeBursts.length; i++) {
    const burst = mergeBursts[i]; burst.life -= dt * .55;
    if (burst.life <= 0) continue;
    mergeBursts[mergeWrite++] = burst;
    ctx.globalAlpha = burst.life * .7; ctx.strokeStyle = burst.color; ctx.lineWidth = 2.5; ctx.shadowBlur = 24; ctx.shadowColor = burst.color;
    [1, .68, .38].forEach(scale => { ctx.beginPath(); ctx.arc(burst.x, burst.y, (1 - burst.life) * 180 * scale + 12, 0, Math.PI * 2); ctx.stroke(); }); ctx.shadowBlur = 0;
  }
  mergeBursts.length = mergeWrite;
  let labelWrite = 0;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]; label.life -= dt * (label.galaxy ? .28 : .7); if (!label.galaxy) label.y -= dt * 8;
    if (label.life <= 0) continue;
    labels[labelWrite++] = label;
    ctx.globalAlpha = Math.min(1, label.life * 2); ctx.fillStyle = label.color; ctx.font = label.galaxy ? '600 18px DM Mono, monospace' : '500 10px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(label.text, label.x, label.y);
  }
  labels.length = labelWrite;
  ctx.globalAlpha = 1; requestAnimationFrame(loop);
}

function editorLaunchOptions() { return { shape: workShape.value, text: workText.value.trim() || '嗨', points: editorPoints, color: workColor.value, size: Number(workSize.value), speed: Number(workSpeed.value) }; }
function consumeTestWork() { testNextWork = false; testWorkButton.classList.remove('active'); testWorkButton.textContent = '测试下一发'; }
function broadcastLaunch(x, y, id, options = {}) {
  if (currentVersion < 3 || !eventSource || eventSource.readyState !== EventSource.OPEN) return;
  fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, id, timestamp: Date.now(), username, x: x / width, y: y / height, width, height, shape: options.shape || selectedShape, text: options.text || textInput.value.trim() || '嗨', points: options.points || [], color: options.color, size: options.size, speed: options.speed }) }).catch(() => setConnectionState(false, '连接中断 · 仅本地'));
}

scene.addEventListener('click', e => { if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea') || e.target.closest('.galaxy-panel')) return; if (currentVersion === 10) { if (galaxyTestNext) { galaxyTestNext = false; galaxyTest.classList.remove('active'); launchGalaxyFirework(true); } return; } const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`; const options = testNextWork && currentVersion >= 7 ? editorLaunchOptions() : {}; launch(e.clientX, e.clientY, { id, ...options }); broadcastLaunch(e.clientX, e.clientY, id, options); if (testNextWork) consumeTestWork(); });
clearButton.addEventListener('click', clearSky);
shapeOptions.forEach(option => option.addEventListener('click', () => { selectedShape = option.dataset.shape; shapeOptions.forEach(item => item.classList.toggle('selected', item === option)); textInput.disabled = selectedShape !== 'text'; if (selectedShape === 'text') textInput.focus(); }));
function versionLabel(version) { return `VERSION ${String(version).padStart(2, '0')}`; }
function switchVersion(version) {
  auto = false; autoLabel.textContent = '自动演示'; autoButton.classList.remove('active'); clearInterval(autoTimer); autoTimer = null;
  if (eventSource) disconnectRealtime();
  currentVersion = Number(version); audioEnabled = currentVersion === 2;
  if (currentVersion >= 2) audioEnabled = true;
  versionTag.textContent = versionLabel(currentVersion);
  versionOptions.forEach(option => option.classList.toggle('active', Number(option.dataset.version) === currentVersion));
  shapePicker.hidden = currentVersion === 1 || currentVersion === 10;
  intro.hidden = currentVersion === 10;
  document.querySelector('.controls').hidden = currentVersion === 10;
  galaxyPanel.hidden = currentVersion !== 10;
  if (currentVersion !== 10) setGalaxyWatching(false);
  collabPanel.hidden = currentVersion < 3 || currentVersion === 10;
  roomControls.hidden = currentVersion < 5;
  roomHint.hidden = currentVersion < 5;
  if (currentVersion === 6) roomHint.textContent = '留空房间号进入公共大厅；填写房间号和密码进入私密房间';
  if (currentVersion === 7 || currentVersion === 8) roomHint.textContent = '进入房间后，可以把作品分享给同房间的人';
  mergeRule.hidden = currentVersion < 4;
  lobbyPanel.hidden = currentVersion !== 6;
  editorPanel.hidden = currentVersion < 7 || currentVersion === 10;
  workGallery.hidden = currentVersion < 7 || currentVersion === 10;
  aiPanel.hidden = currentVersion !== 8;
  if (currentVersion >= 7) renderWorks();
  statusEl.textContent = currentVersion === 1 ? '版本 1 · 夜空已就绪' : currentVersion === 2 ? '版本 2 · 夜空已就绪' : currentVersion === 3 ? '版本 3 · 多人模式' : currentVersion === 4 ? '版本 4 · 合并模式' : currentVersion === 5 ? '版本 5 · 房间模式' : currentVersion === 6 ? '版本 6 · 大厅模式' : currentVersion === 7 ? '版本 7 · 作品编辑' : currentVersion === 8 ? '版本 8 · AI 创作' : '版本 10 · 生日银河';
  if (currentVersion === 1) { selectedShape = 'random'; textInput.disabled = true; shapeOptions.forEach(item => item.classList.toggle('selected', item.dataset.shape === 'random')); }
  if (currentVersion >= 3) { textInput.disabled = selectedShape !== 'text'; setConnectionState(false, location.protocol === 'file:' ? '请用服务器地址打开' : '多人模式未连接'); }
  if (currentVersion < 3) disconnectRealtime();
  if (currentVersion === 10) computeAndRenderGalaxy();
}
versionOptions.forEach(option => option.addEventListener('click', () => switchVersion(option.dataset.version)));

function setConnectionState(connected, message) { connectionDot.classList.toggle('connected', connected); connectionText.textContent = message; joinButton.textContent = connected ? '已连接' : currentVersion === 5 ? '进入房间' : currentVersion === 6 ? '进入大厅' : '加入多人'; }
function disconnectRealtime() { if (eventSource) eventSource.close(); eventSource = null; clientId = ''; setConnectionState(false, '多人模式未连接'); }
async function connectRealtime() {
  username = (usernameInput.value.trim() || '烟花玩家').slice(0, 16); usernameInput.value = username;
  if (location.protocol === 'file:') { setConnectionState(false, '请先运行 node server.js'); return; }
  if (currentVersion === 5 || currentVersion === 6 || currentVersion === 7 || currentVersion === 8) {
    roomId = roomInput.value.trim().toUpperCase(); roomInput.value = roomId;
    const password = roomPasswordInput.value;
    if ((currentVersion === 5 || currentVersion === 7 || currentVersion === 8) && !roomId) { setConnectionState(false, '请先创建或输入房间号'); return; }
    if (roomId) {
      if (!password) { setConnectionState(false, '请输入房间密码'); return; }
      setConnectionState(false, '正在验证房间密码');
      try {
        const accessResponse = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const access = await accessResponse.json();
        if (!access.ok) { setConnectionState(false, '房间号或密码不正确'); return; }
        roomToken = access.token;
      } catch (_) { setConnectionState(false, '无法连接房间服务'); return; }
    } else { roomId = 'LOBBY'; roomToken = ''; }
  }
  disconnectRealtime();
  const roomQuery = currentVersion >= 5 ? `&room=${encodeURIComponent(roomId)}${roomToken ? `&token=${encodeURIComponent(roomToken)}` : ''}` : '';
  eventSource = new EventSource(`/events?username=${encodeURIComponent(username)}${roomQuery}`);
  eventSource.onopen = () => setConnectionState(true, currentVersion >= 5 && roomId !== 'LOBBY' ? `房间 ${roomId} · ${username}` : currentVersion === 6 ? `大厅 · ${username}` : `已连接 · ${username}`);
  eventSource.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'hello') { clientId = data.clientId; return; }
    if (data.type === 'launch' && data.clientId !== clientId) launch(data.x * width, data.y * height, { remote: true, owner: data.username, shape: data.shape, text: data.text, points: data.points, color: data.color, size: data.size, speed: data.speed, id: data.id });
    if (data.type === 'merge') { showMergeDebug(data); triggerMegaBurst(data.x * width, data.y * height, data.names, data.ids); }
    if (data.type === 'chat') { showDanmaku(data); if (data.replyTo && data.replyTo === username) showReplyNotice(data); }
    if (data.type === 'work' && currentVersion >= 7) addWork(data.work, true, data.username);
  };
  eventSource.onerror = () => setConnectionState(false, '连接中断 · 仅本地');
}
joinButton.addEventListener('click', connectRealtime);
usernameInput.addEventListener('keydown', event => { if (event.key === 'Enter') connectRealtime(); });
roomInput.addEventListener('keydown', event => { if (event.key === 'Enter') connectRealtime(); });
createRoomButton.addEventListener('click', async () => {
  try {
    const password = roomPasswordInput.value;
    if (password.length < 4) { setConnectionState(false, '房间密码至少 4 位'); return; }
    const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await response.json();
    if (!data.roomId) throw new Error('room unavailable');
    roomInput.value = data.roomId; roomId = data.roomId; roomHint.textContent = `房间 ${roomId} 已创建 · 把房间号和密码发给朋友`;
    connectRealtime();
  } catch (_) { setConnectionState(false, '创建房间失败 · 请确认服务端已启动'); }
});
function showDanmaku(data) {
  const item = document.createElement('div'); item.className = 'danmaku'; item.style.top = `${12 + Math.random() * 72}%`; item.style.setProperty('--duration', `${8 + Math.random() * 5}s`); item.style.color = ['#d09cff', '#9ae1ff', '#ffb55b', '#ff91c8'][Math.floor(Math.random() * 4)];
  const user = document.createElement('b'); user.textContent = data.username || '大厅用户';
  if (data.replyTo) { const reply = document.createElement('span'); reply.className = 'reply-mark'; reply.textContent = `↳ @${data.replyTo}`; item.append(reply); }
  item.append(user, document.createTextNode(data.text || ''));
  item.title = `点击回复 ${data.username || '大厅用户'}`;
  item.addEventListener('click', event => { event.stopPropagation(); replyTarget = data.username || ''; chatInput.value = `@${replyTarget} `; chatInput.focus(); statusEl.textContent = `正在回复 @${replyTarget}`; });
  danmakuLayer.appendChild(item); item.addEventListener('animationend', () => item.remove());
  while (danmakuLayer.children.length > 40) danmakuLayer.firstElementChild.remove();
}
function showReplyNotice(data) {
  replyNoticeTitle.textContent = `${data.username || '有人'} 回复了你`;
  replyNoticeText.textContent = data.text || '';
  replyNotice.hidden = false;
  window.clearTimeout(showReplyNotice.timer);
  showReplyNotice.timer = window.setTimeout(() => { replyNotice.hidden = true; }, 3600);
}
async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || currentVersion !== 6 || !eventSource || eventSource.readyState !== EventSource.OPEN) return;
  chatInput.value = '';
  try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, text, replyTo: replyTarget }) }); if (!response.ok) throw new Error('chat failed'); replyTarget = ''; } catch (_) { setConnectionState(false, '大厅连接中断 · 请重启服务端'); }
}
sendChatButton.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', event => { if (event.key === 'Enter') sendChat(); });
function loadWorks() { try { return JSON.parse(localStorage.getItem('fireworks-works-v7') || '[]'); } catch (_) { return []; } }
function persistWorks() { try { localStorage.setItem('fireworks-works-v7', JSON.stringify(savedWorks.slice(0, 24))); } catch (_) {} }
function editorWork() { return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: (workText.value.trim() || workShape.value || '我的烟花').slice(0, 16), shape: workShape.value, text: workText.value.trim() || '嗨', points: editorPoints, color: workColor.value, size: Number(workSize.value), speed: Number(workSpeed.value) }; }
function playWork(work) { launch(width * (.2 + Math.random() * .6), height * (.22 + Math.random() * .45), { shape: work.shape, text: work.text, points: work.points, color: work.color, size: work.size, speed: work.speed, owner: work.sharedBy || username }); }
function addWork(work, shared = false, sharedBy = '') { const item = { ...work, id: work.id || `${Date.now()}-${Math.random()}`, sharedBy: sharedBy || work.sharedBy || '' }; if (!savedWorks.some(existing => existing.id === item.id)) savedWorks.unshift(item); if (!shared) persistWorks(); renderWorks(); if (shared) workStatus.textContent = `${sharedBy || '有人'} 分享了一个作品`; }
function renderWorks() { workList.innerHTML = ''; if (!savedWorks.length) { workList.innerHTML = '<div class="work-status">还没有作品，先保存一个吧</div>'; return; } savedWorks.slice(0, 24).forEach(work => { const card = document.createElement('div'); card.className = 'work-card'; const name = document.createElement('div'); name.className = 'work-name'; name.textContent = work.name; const meta = document.createElement('div'); meta.className = 'work-meta'; meta.textContent = `${work.sharedBy ? `来自 ${work.sharedBy}` : '我的作品'} · ${work.shape}`; const share = document.createElement('button'); share.className = 'work-share'; share.type = 'button'; share.textContent = '分享'; share.addEventListener('click', event => { event.stopPropagation(); shareWork(work); }); const remove = document.createElement('button'); remove.className = 'work-delete'; remove.type = 'button'; remove.textContent = '删除'; remove.addEventListener('click', event => { event.stopPropagation(); deleteWork(work.id); }); card.append(name, share, meta, remove); card.addEventListener('click', () => playWork(work)); workList.appendChild(card); }); }
function deleteWork(id) { savedWorks = savedWorks.filter(work => work.id !== id); persistWorks(); renderWorks(); workStatus.textContent = '作品已从本机删除'; }
async function shareWork(work) { if (!eventSource || eventSource.readyState !== EventSource.OPEN || currentVersion < 7 || roomId === 'LOBBY') { workStatus.textContent = '请先进入 V7/V8 私密房间'; return; } try { const response = await fetch('/api/work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, work }) }); if (!response.ok) throw new Error('share failed'); workStatus.textContent = '作品已分享给房间成员'; } catch (_) { workStatus.textContent = '分享失败，请检查房间连接'; } }
saveWorkButton.addEventListener('click', () => { const work = editorWork(); addWork(work); workStatus.textContent = '作品已保存到本机'; });
shareWorkButton.addEventListener('click', () => shareWork(editorWork()));
testWorkButton.addEventListener('click', () => { if (currentVersion < 7) return; testNextWork = true; testWorkButton.classList.add('active'); testWorkButton.textContent = '已启用 · 下一发'; workStatus.textContent = '下一次点击夜空将使用当前测试效果'; });
async function runAI(type) {
  const prompt = aiPrompt.value.trim(); if (!prompt) { aiResult.textContent = '先告诉 AI 你想创作什么'; return; }
  aiResult.textContent = 'AI 正在创作…';
  try {
    const response = await fetch('/api/ai/generate', { method: 'POST', signal: AbortSignal.timeout(70000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, prompt }) });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'AI unavailable');
    if (type === 'firework' && data.result) { const work = data.result; workShape.value = work.shape || 'random'; workText.value = work.shape === 'custom' ? '' : (work.text || ''); editorPoints = Array.isArray(work.points) ? work.points : []; workColor.value = work.color || '#ffb55b'; workSize.value = work.size || 1; workSpeed.value = work.speed || 1; testNextWork = true; testWorkButton.classList.add('active'); testWorkButton.textContent = '已启用 · 下一发'; aiResult.textContent = `AI 已实时生成${work.shape === 'custom' ? '粒子图形' : '烟花参数'}，请点击“测试下一发”后再点击夜空`; }
    if (type === 'text' && data.result) { workShape.value = 'text'; workText.value = data.result.text || ''; testNextWork = true; testWorkButton.classList.add('active'); testWorkButton.textContent = '已启用 · 下一发'; aiResult.textContent = 'AI 已实时生成文字烟花'; }
    if (type === 'theme' && data.result) { const theme = data.result; if (theme.accent) document.documentElement.style.setProperty('--accent', theme.accent); if (theme.background) scene.style.background = theme.background; aiResult.textContent = `${theme.name || '主题'}：${theme.description || '主题已应用'}`; }
  } catch (error) { aiResult.textContent = `AI 暂不可用：${error.message}`; }
}
aiFireworkButton.addEventListener('click', () => runAI('firework')); aiTextButton.addEventListener('click', () => runAI('text')); aiThemeButton.addEventListener('click', () => runAI('theme'));
galaxyLaunch.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); launchGalaxyFirework(); });
galaxyTest.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  if (!galaxyState && !computeAndRenderGalaxy()) return;
  galaxyTestNext = true;
  galaxyTest.classList.add('active');
  galaxyStatus.textContent = '已启用测试下一发：点击右侧夜空将放出当前银河烟花';
  launchGalaxyFirework();
});
galaxyCompute.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); computeAndRenderGalaxy(); });
galaxyPanel.addEventListener('pointerdown', event => event.stopPropagation());
galaxyPanel.addEventListener('click', event => event.stopPropagation());
galaxyDate.addEventListener('change', computeAndRenderGalaxy);
galaxyDate.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); computeAndRenderGalaxy(); } });
galaxyBack.addEventListener('click', event => { event.stopPropagation(); setGalaxyWatching(false); });
autoButton.addEventListener('click', () => { auto = !auto; autoLabel.textContent = auto ? '停止演示' : '自动演示'; statusEl.textContent = auto ? '自动演示中' : '夜空已就绪'; autoButton.classList.toggle('active', auto); if (auto) { if (currentVersion === 10) launchGalaxyFirework(); else launch(); autoTimer = setInterval(() => currentVersion === 10 ? launchGalaxyFirework() : launch(), currentVersion === 10 ? 4200 : 700 + Math.random() * 850); } else { clearInterval(autoTimer); autoTimer = null; } });
window.addEventListener('keydown', e => { if (e.key === 'Escape') { setGalaxyWatching(false); } if (e.target.closest('input') || e.target.closest('textarea')) return; if (e.key.toLowerCase() === 'c') clearSky(); if (e.key.toLowerCase() === 'r') currentVersion === 10 ? launchGalaxyFirework() : launch(); });
window.addEventListener('resize', resize);
resize();
ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, width, height);
requestAnimationFrame(loop);
