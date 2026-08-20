const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 5180);
const ROOT = __dirname;
const clients = new Map();
const monitors = new Set();
const rooms = new Map([['LOBBY', { createdAt: Date.now() }]]);
const metrics = { received: 0, broadcast: 0, connected: 0, lastEvent: null };
const recentLaunches = [];
let lastAIGeneration = null;
let runtimeAIProvider = process.env.AI_PROVIDER || 'openai';
let runtimeAIKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
let runtimeAIModel = process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || (runtimeAIProvider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
let runtimeAIBaseUrl = process.env.AI_BASE_URL || (runtimeAIProvider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1');
let runtimeAIPrompt = process.env.AI_SYSTEM_PROMPT || '你是烟花创意助手。只输出严格 JSON，不要 markdown。';

function aiEndpoint() { const base = runtimeAIBaseUrl.replace(/\/$/, ''); return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function passwordHash(password) { return crypto.createHash('sha256').update(String(password || '')).digest('hex'); }

function sanitizePoints(points) { return Array.isArray(points) ? points.filter(point => Array.isArray(point) && point.length >= 2).slice(0, 500).map(point => [Math.max(-1, Math.min(1, Number(point[0]) || 0)), Math.max(-1, Math.min(1, Number(point[1]) || 0))]) : []; }
function buildSystemPrompt(type) {
  const schema = type === 'firework' ? '{"shape":"random|star|heart|burst|text|custom","text":"文字烟花内容，custom时留空","points":[[-1,-1],[0,0],[1,1]],"color":"#RRGGBB","size":1,"speed":1}' : type === 'text' ? '{"text":"最多12个中文字符"}' : '{"name":"主题名","accent":"#RRGGBB","background":"安全的CSS渐变","description":"一句话介绍"}';
  const instruction = type === 'firework' ? '颜色、银河、星空、慢速等氛围描述请用 burst/star 加 color/size/speed，points 留空数组。只有用户明确要鱼、心形轮廓、动物或可识别物体时才用 custom，并生成 80-140 个点；points 是相对中心归一化坐标，范围 -1 到 1。不要使用 emoji，不要把物体写进 text。' : '';
  return `${runtimeAIPrompt}\n${instruction}\n目标结构：${schema}`;
}
function extractAIContent(data) {
  const message = data.choices?.[0]?.message || {};
  const raw = message.content || message.reasoning_content || '';
  const text = Array.isArray(raw) ? raw.map(part => part.text || '').join('') : String(raw);
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text.trim();
}
async function generateAI(type, prompt) {
  if (!runtimeAIKey) return { ok: false, error: '未配置 AI API Key，请先在通讯面板的 AI CONFIGURATION 中配置' };
  try {
    const systemPrompt = buildSystemPrompt(type);
    const response = await fetch(aiEndpoint(), { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runtimeAIKey}` }, body: JSON.stringify({ model: runtimeAIModel, temperature: .8, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: String(prompt).slice(0, 180) }] }) });
    if (!response.ok) {
      const detail = (await response.text()).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').slice(0, 180);
      return { ok: false, error: `AI 服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}` };
    }
    const data = await response.json(); const content = extractAIContent(data); if (!content) return { ok: false, error: 'AI 没有返回有效内容' };
    const result = JSON.parse(content);
    if (type === 'firework') {
      result.points = sanitizePoints(result.points);
      if (result.shape === 'custom' && !result.points.length) return { ok: false, error: 'AI 没有生成有效的粒子坐标阵列，请重试' };
      if (result.shape === 'custom') result.text = '';
    }
    return { ok: true, source: 'model', result };
  } catch (error) { return { ok: false, error: error.name === 'TimeoutError' ? 'AI 请求超过 60 秒，已自动停止，请检查接口或稍后重试' : `AI 返回解析失败：${error.message}` }; }
}

function broadcast(payload, roomId) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.values()) if (!roomId || client.roomId === roomId) client.res.write(message);
}

function broadcastMonitor(payload) {
  const message = `data: ${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n\n`;
  for (const monitor of monitors) monitor.write(message);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }

  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    const body = await readBody(req).catch(() => ({}));
    if (String(body.password || '').length < 4) return sendJson(res, 400, { ok: false, error: 'password too short' });
    let roomId;
    do { roomId = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(roomId));
    rooms.set(roomId, { createdAt: Date.now(), passwordHash: passwordHash(body.password), tokens: new Set() });
    return sendJson(res, 200, { ok: true, roomId });
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/rooms\/[^/]+\/access$/)) {
    const roomId = url.pathname.split('/')[3].toUpperCase();
    const room = rooms.get(roomId);
    const body = await readBody(req).catch(() => ({}));
    if (!room || !room.passwordHash || passwordHash(body.password) !== room.passwordHash) return sendJson(res, 403, { ok: false, error: 'invalid room password' });
    const token = crypto.randomUUID(); room.tokens.add(token);
    return sendJson(res, 200, { ok: true, token, roomId });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
    const roomId = url.pathname.split('/').pop().toUpperCase();
    if (!rooms.has(roomId)) return sendJson(res, 404, { ok: false, error: 'room not found' });
    return sendJson(res, 200, { ok: true, roomId, clients: [...clients.values()].filter(client => client.roomId === roomId).length });
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    const clientId = crypto.randomUUID();
    const username = String(url.searchParams.get('username') || '烟花玩家').slice(0, 16);
    const roomId = String(url.searchParams.get('room') || 'LOBBY').trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return sendJson(res, 404, { ok: false, error: 'room not found' });
    if (roomId !== 'LOBBY' && !room.tokens.has(String(url.searchParams.get('token') || ''))) return sendJson(res, 403, { ok: false, error: 'room access denied' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify({ type: 'hello', clientId, roomId })}\n\n`);
    clients.set(clientId, { res, username, roomId });
    metrics.connected = clients.size;
    broadcastMonitor({ type: 'server-log', stage: 'connect', message: `${username} 加入房间 ${roomId}`, clients: clients.size, roomId });
    req.on('close', () => { clients.delete(clientId); metrics.connected = clients.size; broadcastMonitor({ type: 'server-log', stage: 'disconnect', message: `${username} 离开房间 ${roomId}`, clients: clients.size, roomId }); });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/monitor-events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify({ type: 'monitor-hello', connected: clients.size, received: metrics.received, broadcast: metrics.broadcast, lastAI: lastAIGeneration })}\n\n`);
    monitors.add(res);
    req.on('close', () => monitors.delete(res));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, clients: clients.size });

  if (req.method === 'GET' && url.pathname === '/api/config/ai') return sendJson(res, 200, { ok: true, configured: Boolean(runtimeAIKey), provider: runtimeAIProvider, model: runtimeAIModel, baseUrl: runtimeAIBaseUrl, prompt: runtimeAIPrompt });

  if (req.method === 'POST' && url.pathname === '/api/config/ai') {
    try {
      const body = await readBody(req);
      const apiKey = String(body.apiKey || '').trim();
      const model = String(body.model || '').trim().slice(0, 80);
      const prompt = String(body.prompt || '').trim().slice(0, 4000);
      const provider = ['openai', 'deepseek', 'custom'].includes(body.provider) ? body.provider : 'openai';
      if (apiKey) runtimeAIKey = apiKey;
      if (model) runtimeAIModel = model;
      runtimeAIProvider = provider;
      runtimeAIBaseUrl = String(body.baseUrl || '').trim() || (provider === 'deepseek' ? 'https://api.deepseek.com/v1' : provider === 'openai' ? 'https://api.openai.com/v1' : '');
      if (provider === 'deepseek' && (!model || model === 'gpt-4o-mini')) runtimeAIModel = 'deepseek-chat';
      if (provider === 'openai' && (!model || model === 'deepseek-chat')) runtimeAIModel = 'gpt-4o-mini';
      if (prompt) runtimeAIPrompt = prompt;
      if (provider === 'custom' && !runtimeAIBaseUrl) return sendJson(res, 400, { ok: false, error: 'custom base url required' });
      return sendJson(res, 200, { ok: true, configured: Boolean(runtimeAIKey), provider: runtimeAIProvider, model: runtimeAIModel, baseUrl: runtimeAIBaseUrl });
    } catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid ai config' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/generate') {
    try {
      const body = await readBody(req);
      const type = ['firework', 'text', 'theme'].includes(body.type) ? body.type : 'firework';
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return sendJson(res, 400, { ok: false, error: 'prompt required' });
      const result = await generateAI(type, prompt);
      if (result.ok) {
        lastAIGeneration = { type: 'ai-generation', stage: 'process', message: `LLM 生成 ${type}：${prompt.slice(0, 60)}`, prompt, systemPrompt: buildSystemPrompt(type), result: result.result };
        broadcastMonitor(lastAIGeneration);
      }
      return sendJson(res, result.ok ? 200 : 503, result);
    } catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid ai request' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const body = await readBody(req);
      const clientId = String(body.clientId || '');
      const sender = clients.get(clientId);
      const text = String(body.text || '').trim().slice(0, 42);
      const replyTo = String(body.replyTo || '').trim().slice(0, 16);
      if (!sender || !text) return sendJson(res, 403, { ok: false, error: 'channel access denied' });
      broadcast({ type: 'chat', username: sender.username, text, replyTo, clientId }, sender.roomId);
      broadcastMonitor({ type: 'server-log', stage: 'chat', message: `${sender.username} 在 ${sender.roomId === 'LOBBY' ? '大厅' : `房间 ${sender.roomId}`} ${replyTo ? `回复 @${replyTo} ` : ''}发送弹幕：${text}`, username: sender.username, roomId: sender.roomId });
      return sendJson(res, 200, { ok: true });
    } catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid chat' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/work') {
    try {
      const body = await readBody(req);
      const clientId = String(body.clientId || '');
      const sender = clients.get(clientId);
      const source = body.work || {};
      const shape = ['random', 'star', 'heart', 'burst', 'text', 'custom'].includes(source.shape) ? source.shape : 'random';
      const color = /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? String(source.color) : '#ffb55b';
      const points = Array.isArray(source.points) ? source.points.filter(point => Array.isArray(point) && point.length >= 2).slice(0, 500).map(point => [Math.max(-1, Math.min(1, Number(point[0]) || 0)), Math.max(-1, Math.min(1, Number(point[1]) || 0))]) : [];
      const work = { id: String(source.id || crypto.randomUUID()).slice(0, 80), name: String(source.name || '未命名烟花').slice(0, 16), shape, text: String(source.text || '嗨').slice(0, 8), points, color, size: Math.max(.5, Math.min(2.2, Number(source.size) || 1)), speed: Math.max(.6, Math.min(1.8, Number(source.speed) || 1)) };
      if (!sender || sender.roomId === 'LOBBY') return sendJson(res, 403, { ok: false, error: 'private room required' });
      broadcast({ type: 'work', username: sender.username, work, clientId }, sender.roomId);
      broadcastMonitor({ type: 'server-log', stage: 'work', message: `${sender.username} 在房间 ${sender.roomId} 分享作品「${work.name}」`, username: sender.username, roomId: sender.roomId });
      return sendJson(res, 200, { ok: true });
    } catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid work' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/launch') {
    try {
      const body = await readBody(req);
      const username = String(body.username || '烟花玩家').slice(0, 16);
      const shape = ['random', 'star', 'heart', 'burst', 'text', 'custom'].includes(body.shape) ? body.shape : 'random';
      const color = /^#[0-9a-f]{6}$/i.test(String(body.color || '')) ? String(body.color) : '';
      const size = Math.max(.5, Math.min(2.2, Number(body.size) || 1));
      const speed = Math.max(.6, Math.min(1.8, Number(body.speed) || 1));
      const points = Array.isArray(body.points) ? body.points.filter(point => Array.isArray(point) && point.length >= 2).slice(0, 500).map(point => [Math.max(-1, Math.min(1, Number(point[0]) || 0)), Math.max(-1, Math.min(1, Number(point[1]) || 0))]) : [];
      const x = Math.max(0, Math.min(1, Number(body.x) || .5));
      const y = Math.max(0, Math.min(1, Number(body.y) || .5));
      const clientId = clients.has(String(body.clientId || '')) ? String(body.clientId) : '';
      const sender = clients.get(clientId);
      if (!sender) return sendJson(res, 403, { ok: false, error: 'not connected' });
      const roomId = sender.roomId;
      const id = String(body.id || crypto.randomUUID()).slice(0, 80);
      const eventTime = Number(body.timestamp) || Date.now();
      const viewportWidth = Math.max(1, Number(body.width) || 1000);
      const viewportHeight = Math.max(1, Number(body.height) || 1000);
      const actualUsername = sender.username;
      const point = { id, clientId, username: actualUsername, roomId, x, y, xPx: x * viewportWidth, yPx: y * viewportHeight, time: eventTime };
      while (recentLaunches.length && eventTime - recentLaunches[0].time > 5000) recentLaunches.shift();
      const partner = recentLaunches.find(item => item.roomId === roomId && item.clientId && clientId && item.clientId !== clientId && Math.abs(item.time - eventTime) <= 5000 && Math.hypot(item.xPx - point.xPx, item.yPx - point.yPx) <= 60);
      recentLaunches.push(point);
      while (recentLaunches.length > 200) recentLaunches.shift();
      metrics.received++;
      metrics.lastEvent = Date.now();
      broadcastMonitor({ type: 'server-log', stage: 'receive', message: `${actualUsername} 发来一枚 ${shape} 烟花 · 房间 ${roomId} · 点击坐标 (${Math.round(point.xPx)}, ${Math.round(point.yPx)})`, username: actualUsername, shape, roomId, x, y, xPx: point.xPx, yPx: point.yPx, received: metrics.received });
      broadcastMonitor({ type: 'server-log', stage: 'process', message: `房间 ${roomId} 校验通过 · 坐标已记录 (${Math.round(point.xPx)}, ${Math.round(point.yPx)}) · 事件编号 #${metrics.received}`, username: actualUsername, shape, roomId, xPx: point.xPx, yPx: point.yPx });
      broadcast({ type: 'launch', clientId, id, username: actualUsername, x, y, shape, text: String(body.text || '嗨').slice(0, 8), points, color, size, speed }, roomId);
      metrics.broadcast++;
      broadcastMonitor({ type: 'server-log', stage: 'broadcast', message: `房间 ${roomId} 已广播给 ${Math.max(0, [...clients.values()].filter(client => client.roomId === roomId).length - 1)} 个其他客户端`, username: actualUsername, shape, roomId, clients: clients.size, broadcast: metrics.broadcast });
      if (partner) {
        const distance = Math.hypot(partner.xPx - point.xPx, partner.yPx - point.yPx);
        const deltaMs = Math.abs(partner.time - eventTime);
        const merge = { type: 'merge', x: (partner.x + x) / 2, y: (partner.y + y) / 2, names: [partner.username, actualUsername], ids: [partner.id, id], distance, deltaMs };
        broadcast(merge, roomId);
        broadcastMonitor({ type: 'server-log', stage: 'merge', message: `${partner.username} + ${actualUsername} 触发合并烟花 · 房间 ${roomId} · 中心 (${Math.round((partner.xPx + point.xPx) / 2)}, ${Math.round((partner.yPx + point.yPx) / 2)}) · ${Math.round(distance)}px · ${deltaMs}ms`, username: `${partner.username} + ${actualUsername}`, roomId, clients: clients.size });
        recentLaunches.splice(recentLaunches.indexOf(partner), 1);
      }
      return sendJson(res, 200, { ok: true });
    } catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid launch' }); }
  }

  if (req.method === 'GET') {
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.resolve(ROOT, `.${requested}`);
    if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
  }
  sendJson(res, 404, { error: 'not found' });
});

setInterval(() => { for (const client of clients.values()) client.res.write(': heartbeat\n\n'); }, 15000);
server.listen(PORT, '0.0.0.0', () => console.log(`烟花多人版已启动：http://localhost:${PORT}`));
