import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  tiktokUsername: '',
  tts: {
    enabled: true,
    voice: 'bg_BG-dimitar-medium',
    speed: 1.0,          // 0.5 - 2.0, подава се на Piper като length_scale (обратно пропорционално)
    volume: 1.0,          // 0 - 1
    readChat: true,
    readGifts: true,
    readFollows: true,
    readShares: false,
    readLikesEvery: 0,    // 0 = изключено, иначе съобщение на всеки N лайка
    minGiftCoins: 1,       // подаръци под тази стойност в монети се пропускат
    maxQueueLength: 25,    // максимален брой чакащи съобщения преди да се режат
    blacklistWords: [],    // думи, които се цензурират / пропускат
    chatTemplate: '{user} казва: {message}',
    giftTemplate: '{user} изпрати {giftName} x{count}',
    followTemplate: '{user} последва канала!',
    shareTemplate: '{user} сподели стрийма!'
  },
  overlay: {
    showChat: true,
    showGifts: true,
    showFollows: true,
    showLikes: true,
    alertDurationMs: 6000,
    theme: 'neon'
  }
};

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

export function loadConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return structuredClone(DEFAULT_CONFIG);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch (err) {
    console.error('[config] Грешка при зареждане, връщам стойности по подразбиране:', err.message);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(newConfig) {
  const merged = deepMerge(loadConfig(), newConfig);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export { DEFAULT_CONFIG };
