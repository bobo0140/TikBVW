const socket = io();

const el = (id) => document.getElementById(id);

const usernameInput = el('usernameInput');
const connectBtn = el('connectBtn');
const disconnectBtn = el('disconnectBtn');
const tally = el('tally');
const tallyLabel = el('tallyLabel');
const roomInfo = el('roomInfo');
const viewerCount = el('viewerCount');
const likeCount = el('likeCount');
const feed = el('feed');
const clearFeedBtn = el('clearFeedBtn');
const vuMeter = el('vuMeter');
const voiceTag = el('voiceTag');
const voiceStatusMsg = el('voiceStatusMsg');
const overlayLink = el('overlayLink');
const ttsPlayer = el('ttsPlayer');

const ttsEnabled = el('ttsEnabled');
const readChat = el('readChat');
const readGifts = el('readGifts');
const readFollows = el('readFollows');
const readShares = el('readShares');
const speedRange = el('speedRange');
const speedVal = el('speedVal');
const minGiftCoins = el('minGiftCoins');
const blacklistWords = el('blacklistWords');
const saveSettingsBtn = el('saveSettingsBtn');

const testText = el('testText');
const testTtsBtn = el('testTtsBtn');

let likesSeen = 0;

overlayLink.textContent = `${window.location.origin}/overlay.html`;

// ---------- Помощни ----------

function fmtTime() {
  const d = new Date();
  return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pushEvent(html, cls = '') {
  const div = document.createElement('div');
  div.className = `event ${cls}`;
  div.innerHTML = `<span class="time">${fmtTime()}</span><span class="body">${html}</span>`;
  feed.appendChild(div);
  while (feed.children.length > 200) feed.removeChild(feed.firstChild);
}

function setLive(isLive, label) {
  tally.classList.toggle('live', isLive);
  tallyLabel.textContent = label;
}

// ---------- Свързване ----------

connectBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) return pushEvent('Въведи TikTok потребителско име.', 'log-error');
  connectBtn.disabled = true;
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Грешка при свързване');
  } catch (err) {
    pushEvent(`Неуспешно свързване: ${err.message}`, 'log-error');
  } finally {
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', async () => {
  await fetch('/api/disconnect', { method: 'POST' });
});

// ---------- Socket събития от сървъра ----------

socket.on('tiktok:status', (status) => {
  if (status.connected) {
    setLive(true, `НА ЖИВО @${status.username}`);
    roomInfo.textContent = status.roomId ? `Стая: ${status.roomId}` : '';
  } else {
    setLive(false, 'ИЗЧАКВАНЕ');
    roomInfo.textContent = '';
  }
});

socket.on('tiktok:log', (log) => {
  pushEvent(log.message, log.level === 'error' ? 'log-error' : '');
});

socket.on('tiktok:event', (evt) => {
  switch (evt.type) {
    case 'chat':
      pushEvent(`<b>${evt.user}</b>: ${evt.message}`, 'chat');
      break;
    case 'gift':
      pushEvent(`<b>${evt.user}</b> изпрати <b>${evt.giftName}</b> ×${evt.count} (${evt.coins} монети)`, 'gift');
      break;
    case 'follow':
      pushEvent(`<b>${evt.user}</b> последва канала`, 'follow');
      break;
    case 'share':
      pushEvent(`<b>${evt.user}</b> сподели стрийма`, 'share');
      break;
    case 'like':
      likesSeen += evt.likeCount || 0;
      likeCount.innerHTML = `${likesSeen}<small>лайкове</small>`;
      break;
    case 'roomUser':
      viewerCount.innerHTML = `${evt.viewerCount ?? 0}<small>зрители</small>`;
      break;
  }
});

socket.on('config:updated', (config) => {
  ttsEnabled.checked = config.tts.enabled;
  readChat.checked = config.tts.readChat;
  readGifts.checked = config.tts.readGifts;
  readFollows.checked = config.tts.readFollows;
  readShares.checked = config.tts.readShares;
  speedRange.value = config.tts.speed;
  speedVal.textContent = `${config.tts.speed.toFixed(1)}×`;
  minGiftCoins.value = config.tts.minGiftCoins;
  blacklistWords.value = (config.tts.blacklistWords || []).join(', ');
  voiceTag.textContent = config.tts.voice;
  if (usernameInput.value === '' && config.tiktokUsername) usernameInput.value = config.tiktokUsername;
});

// ---------- TTS аудио изпълнение ----------

socket.on('tts:audio', ({ audio }) => {
  const blob = base64ToBlob(audio, 'audio/wav');
  const url = URL.createObjectURL(blob);
  ttsPlayer.src = url;
  vuMeter.classList.add('active');
  ttsPlayer.play().catch(() => {});
  ttsPlayer.onended = () => { vuMeter.classList.remove('active'); URL.revokeObjectURL(url); };
});

socket.on('tts:error', ({ error }) => {
  voiceStatusMsg.textContent = `Грешка в TTS: ${error}`;
  voiceStatusMsg.style.color = 'var(--signal-live)';
});

function base64ToBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

// ---------- Проверка на гласовите файлове ----------

fetch('/api/voice-check').then(r => r.json()).then((v) => {
  if (!v.ready) {
    const missing = [];
    if (!v.piperExists) missing.push('piper бинарник');
    if (!v.modelExists) missing.push('.onnx модел');
    if (!v.configExists) missing.push('.onnx.json конфиг');
    voiceStatusMsg.textContent = `Липсва: ${missing.join(', ')}. Виж README.md`;
    voiceStatusMsg.style.color = 'var(--accent-gift)';
  } else {
    voiceStatusMsg.textContent = 'Гласът е зареден и готов.';
    voiceStatusMsg.style.color = 'var(--accent-tts)';
  }
});

// ---------- Настройки ----------

speedRange.addEventListener('input', () => {
  speedVal.textContent = `${parseFloat(speedRange.value).toFixed(1)}×`;
});

saveSettingsBtn.addEventListener('click', async () => {
  const body = {
    tts: {
      enabled: ttsEnabled.checked,
      readChat: readChat.checked,
      readGifts: readGifts.checked,
      readFollows: readFollows.checked,
      readShares: readShares.checked,
      speed: parseFloat(speedRange.value),
      minGiftCoins: parseInt(minGiftCoins.value, 10) || 0,
      blacklistWords: blacklistWords.value.split(',').map(w => w.trim()).filter(Boolean)
    }
  };
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  pushEvent('Настройките са запазени.', '');
});

testTtsBtn.addEventListener('click', async () => {
  await fetch('/api/tts/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testText.value })
  });
});

clearFeedBtn.addEventListener('click', () => { feed.innerHTML = ''; });
