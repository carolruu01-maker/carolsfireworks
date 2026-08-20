const eventList = document.querySelector('#eventList');
const serverState = document.querySelector('#serverState');
const clientCount = document.querySelector('#clientCount');
const receiveCount = document.querySelector('#receiveCount');
const broadcastCount = document.querySelector('#broadcastCount');
const flowState = document.querySelector('#flowState');
const eventHint = document.querySelector('#eventHint');
const lastEvent = document.querySelector('#lastEvent');
const apiKeyInput = document.querySelector('#apiKeyInput');
const providerInput = document.querySelector('#providerInput');
const baseUrlInput = document.querySelector('#baseUrlInput');
const modelInput = document.querySelector('#modelInput');
const saveAIConfig = document.querySelector('#saveAIConfig');
const aiConfigState = document.querySelector('#aiConfigState');
const promptInput = document.querySelector('#promptInput');
const savePrompt = document.querySelector('#savePrompt');
const promptState = document.querySelector('#promptState');
const effectivePrompt = document.querySelector('#effectivePrompt');
const pointCanvas = document.querySelector('#pointCanvas');
const pointMeta = document.querySelector('#pointMeta');
const pointPrompt = document.querySelector('#pointPrompt');
const pointShape = document.querySelector('#pointShape');
const pointCount = document.querySelector('#pointCount');
let stream;

function applyProviderDefaults() {
  if (providerInput.value === 'deepseek') {
    if (!baseUrlInput.value.trim() || baseUrlInput.value.includes('api.openai.com')) baseUrlInput.value = 'https://api.deepseek.com/v1';
    if (!modelInput.value.trim() || modelInput.value === 'gpt-4o-mini') modelInput.value = 'deepseek-chat';
  } else if (providerInput.value === 'openai') {
    if (!baseUrlInput.value.trim() || baseUrlInput.value.includes('api.deepseek.com')) baseUrlInput.value = 'https://api.openai.com/v1';
    if (!modelInput.value.trim() || modelInput.value === 'deepseek-chat') modelInput.value = 'gpt-4o-mini';
  }
}

function time() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
function addLog(data) {
  const empty = eventList.querySelector('.empty-state'); if (empty) empty.remove();
  const row = document.createElement('div'); row.className = 'event-row';
  row.innerHTML = `<span class="event-time">${time()}</span><span class="event-stage ${data.stage || ''}">${data.stage || 'SYSTEM'}</span><span class="event-message"></span><span class="event-meta">${data.username || 'server'}</span>`;
  row.querySelector('.event-message').textContent = data.message || '服务端状态更新';
  eventList.prepend(row); while (eventList.children.length > 80) eventList.lastElementChild.remove();
  flowState.textContent = data.stage === 'broadcast' ? '已广播' : data.stage === 'receive' ? '已接收' : data.stage === 'process' ? '处理中' : '在线';
  eventHint.textContent = data.message || '服务端正在运行…'; lastEvent.textContent = `LAST EVENT ${time()}`;
}

function drawPointArray(result = {}) {
  const canvas = pointCanvas; const ctx = canvas.getContext('2d'); const width = canvas.width; const height = canvas.height;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(154,225,255,.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(width / 2, 18); ctx.lineTo(width / 2, height - 18); ctx.moveTo(18, height / 2); ctx.lineTo(width - 18, height / 2); ctx.stroke();
  const points = Array.isArray(result.points) ? result.points : []; const color = /^#[0-9a-f]{6}$/i.test(result.color || '') ? result.color : '#d09cff';
  ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fillStyle = color;
  points.forEach(point => { if (!Array.isArray(point) || point.length < 2) return; const x = width / 2 + Number(point[0]) * width * .38; const y = height / 2 + Number(point[1]) * height * .38; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill(); });
  ctx.shadowBlur = 0; pointShape.textContent = result.shape || '—'; pointCount.textContent = String(points.length); pointMeta.textContent = points.length ? `${points.length} 个 LLM 粒子坐标` : '本次结果没有点阵';
}

function connect() {
  stream = new EventSource('/monitor-events');
  stream.onopen = () => { serverState.classList.add('online'); serverState.innerHTML = '<span></span>服务端已连接'; };
  stream.onerror = () => { serverState.classList.remove('online'); serverState.innerHTML = '<span></span>等待服务端'; flowState.textContent = '离线'; };
  stream.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'monitor-hello') { clientCount.textContent = data.connected; receiveCount.textContent = data.received; broadcastCount.textContent = data.broadcast; if (data.lastAI) { pointPrompt.textContent = data.lastAI.prompt || '—'; effectivePrompt.textContent = data.lastAI.systemPrompt || '—'; drawPointArray(data.lastAI.result || {}); pointMeta.textContent = `${pointCount.textContent} 个 LLM 粒子坐标 · 最近一次生成`; } return; }
    if (data.type === 'server-log') { if (data.clients !== undefined) clientCount.textContent = data.clients; if (data.received !== undefined) receiveCount.textContent = data.received; if (data.broadcast !== undefined) broadcastCount.textContent = data.broadcast; addLog(data); }
    if (data.type === 'ai-generation') { pointPrompt.textContent = data.prompt || '—'; effectivePrompt.textContent = data.systemPrompt || '—'; drawPointArray(data.result || {}); addLog({ stage: 'process', message: data.message || 'LLM 已生成点阵' }); }
  };
}
async function loadAIConfig() {
  try { const response = await fetch('/api/config/ai'); const data = await response.json(); aiConfigState.textContent = data.configured ? `已配置 · ${data.provider} · ${data.model}` : '未配置'; aiConfigState.classList.toggle('ready', data.configured); if (data.model) modelInput.value = data.model; if (data.provider) providerInput.value = data.provider; if (data.baseUrl) baseUrlInput.value = data.baseUrl; if (data.prompt) promptInput.value = data.prompt; applyProviderDefaults(); } catch (_) { aiConfigState.textContent = '服务端不可用'; }
}
saveAIConfig.addEventListener('click', async () => {
  saveAIConfig.disabled = true; aiConfigState.textContent = '保存中…';
  try { const response = await fetch('/api/config/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: providerInput.value, baseUrl: baseUrlInput.value.trim(), apiKey: apiKeyInput.value.trim(), model: modelInput.value.trim() }) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'save failed'); apiKeyInput.value = ''; aiConfigState.textContent = `已配置 · ${data.provider} · ${data.model}`; aiConfigState.classList.add('ready'); } catch (_) { aiConfigState.textContent = '保存失败'; } finally { saveAIConfig.disabled = false; }
});
savePrompt.addEventListener('click', async () => {
  savePrompt.disabled = true; promptState.textContent = '保存中…';
  try { const response = await fetch('/api/config/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: providerInput.value, baseUrl: baseUrlInput.value.trim(), model: modelInput.value.trim(), prompt: promptInput.value.trim() }) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'save prompt failed'); promptState.textContent = 'Prompt 已保存，下一次生成立即生效'; } catch (error) { promptState.textContent = `保存失败：${error.message}`; } finally { savePrompt.disabled = false; }
});
providerInput.addEventListener('change', applyProviderDefaults);
document.querySelector('#clearLogs').addEventListener('click', () => { eventList.innerHTML = '<div class="empty-state">服务端事件会显示在这里</div>'; });
connect();
loadAIConfig();
