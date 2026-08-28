import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

import { loadConfig, saveConfig } from './src/configManager.js';
import { tiktokManager } from './src/tiktokManager.js';
import { ttsEngine } from './src/ttsEngine.js';
import { isPackaged } from './src/appPaths.js';

const __dirname = typeof __filename !== 'undefined'
  ? path.dirname(__filename)
  : path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

function openInBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'win32'
    ? `start "" "${url}"`
    : platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {}); // тихо игнорираме грешки (напр. няма графична среда)
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer);

let config = loadConfig();

// ---------- Помощни функции за шаблони и TTS филтри ----------

function applyTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : ''));
}

function censor(text, blacklist) {
  if (!blacklist || !blacklist.length) return text;
  let out = text;
  for (const word of blacklist) {
    if (!word) continue;
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '*'.repeat(word.length));
  }
  return out;
}

function speak(text) {
  if (!config.tts.enabled || !text) return;
  const clean = censor(text, config.tts.blacklistWords).slice(0, 300); // защита срещу огромни съобщения
  ttsEngine.enqueue(clean, { voice: config.tts.voice, speed: config.tts.speed });
}

// ---------- TikTok събития -> overlay + TTS ----------

tiktokManager.on('status', (status) => io.emit('tiktok:status', status));
tiktokManager.on('log', (log) => io.emit('tiktok:log', log));

tiktokManager.on('event', (evt) => {
  io.emit('tiktok:event', evt);

  switch (evt.type) {
    case 'chat':
      if (config.tts.readChat) {
        speak(applyTemplate(config.tts.chatTemplate, { user: evt.user, message: evt.message }));
      }
      break;
    case 'gift':
      if (config.tts.readGifts && evt.coins >= config.tts.minGiftCoins) {
        speak(applyTemplate(config.tts.giftTemplate, {
          user: evt.user, giftName: evt.giftName, count: evt.count
        }));
      }
      break;
    case 'follow':
      if (config.tts.readFollows) {
        speak(applyTemplate(config.tts.followTemplate, { user: evt.user }));
      }
      break;
    case 'share':
      if (config.tts.readShares) {
        speak(applyTemplate(config.tts.shareTemplate, { user: evt.user }));
      }
      break;
    case 'like':
      if (config.tts.readLikesEvery > 0 && evt.accumulated >= config.tts.readLikesEvery) {
        tiktokManager.likeAccumulator = 0;
        speak(`${evt.user} изпрати много лайкове!`);
      }
      break;
  }
});

// ---------- TTS -> излъчване на аудио към overlay/dashboard ----------

ttsEngine.on('ready', (payload) => io.emit('tts:audio', payload));
ttsEngine.on('error', (payload) => io.emit('tts:error', payload));

// ---------- REST API ----------

app.get('/api/config', (req, res) => res.json(config));

app.post('/api/config', (req, res) => {
  config = saveConfig(req.body);
  io.emit('config:updated', config);
  res.json(config);
});

app.get('/api/status', (req, res) => res.json(tiktokManager.getStatus()));

app.get('/api/voice-check', (req, res) => {
  res.json(ttsEngine.checkVoiceReady(config.tts.voice));
});

app.post('/api/connect', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Липсва TikTok потребителско име' });
  try {
    await tiktokManager.connect(username);
    config = saveConfig({ tiktokUsername: username });
    res.json({ ok: true, status: tiktokManager.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  await tiktokManager.disconnect();
  res.json({ ok: true });
});

app.post('/api/tts/test', (req, res) => {
  const text = req.body.text || 'Тест на говорителя на ТикБВВ.';
  speak(text);
  res.json({ ok: true });
});

// ---------- Socket.IO: изпращаме текущото състояние при свързване ----------

io.on('connection', (socket) => {
  socket.emit('config:updated', config);
  socket.emit('tiktok:status', tiktokManager.getStatus());
});

httpServer.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('  ████████╗██╗██╗  ██╗██████╗ ██╗    ██╗██╗    ██╗');
  console.log('  ╚══██╔══╝██║██║ ██╔╝██╔══██╗██║    ██║██║    ██║');
  console.log('     ██║   ██║█████╔╝ ██████╔╝██║ █╗ ██║██║ █╗ ██║');
  console.log('     ██║   ██║██╔═██╗ ██╔══██╗██║███╗██║██║███╗██║');
  console.log('     ██║   ██║██║  ██╗██████╔╝╚███╔███╔╝╚███╔███╔╝');
  console.log('     ╚═╝   ╚═╝╚═╝  ╚═╝╚═════╝  ╚══╝╚══╝  ╚══╝╚══╝ \n');
  console.log(`  Контролна зала:  ${url}`);
  console.log(`  Overlay за OBS:  ${url}/overlay.html\n`);

  const voiceStatus = ttsEngine.checkVoiceReady(config.tts.voice);
  if (!voiceStatus.ready) {
    console.warn('  [!] Говорителят (Piper TTS) не е напълно готов:');
    if (!voiceStatus.piperExists) console.warn(`      - липсва piper бинарник в ${voiceStatus.piperPath}`);
    if (!voiceStatus.modelExists) console.warn(`      - липсва модел ${voiceStatus.modelPath}`);
    if (!voiceStatus.configExists) console.warn(`      - липсва конфиг ${voiceStatus.configPath}`);
    console.warn('      Сложи гласовите файлове в папка voices/ до TikBVW.exe и рестартирай.\n');
  } else {
    console.log('  Говорителят (Piper TTS) е зареден и готов.\n');
  }

  if (isPackaged() || process.env.TIKBVW_AUTO_OPEN === '1') {
    console.log('  Отварям контролната зала в браузъра...\n');
    setTimeout(() => openInBrowser(url), 600);
  }

  console.log('  Затвори този прозорец, за да спреш TikBVW.\n');
});

process.on('SIGINT', () => process.exit(0));
