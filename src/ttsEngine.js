import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { getAppRoot } from './appPaths.js';

const ROOT = getAppRoot();

// Позволява override чрез environment променливи, ако piper/моделите са другаде
const PIPER_BIN = process.env.PIPER_PATH || path.join(ROOT, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
const VOICES_DIR = process.env.VOICES_DIR || path.join(ROOT, 'voices');

class TtsEngine extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
  }

  getVoicePaths(voiceName) {
    const model = path.join(VOICES_DIR, `${voiceName}.onnx`);
    const config = path.join(VOICES_DIR, `${voiceName}.onnx.json`);
    return { model, config };
  }

  checkVoiceReady(voiceName = 'bg_BG-dimitar-medium') {
    const { model, config } = this.getVoicePaths(voiceName);
    const piperExists = fs.existsSync(PIPER_BIN);
    const modelExists = fs.existsSync(model);
    const configExists = fs.existsSync(config);
    return {
      ready: piperExists && modelExists && configExists,
      piperExists,
      modelExists,
      configExists,
      piperPath: PIPER_BIN,
      modelPath: model,
      configPath: config
    };
  }

  /**
   * Добавя текст в опашката за синтезиране. Връща id, за да може клиентът
   * да проследи кога точно аудиото е готово (emit 'ready' / 'error').
   */
  enqueue(text, options = {}) {
    const id = nanoid(8);
    this.queue.push({ id, text, options });
    this.emit('queued', { id, text, queueLength: this.queue.length });
    this._processNext();
    return id;
  }

  clearQueue() {
    this.queue = [];
  }

  async _processNext() {
    if (this.processing) return;
    const job = this.queue.shift();
    if (!job) return;
    this.processing = true;

    try {
      const audioBuffer = await this._synthesize(job.text, job.options);
      this.emit('ready', { id: job.id, text: job.text, audio: audioBuffer.toString('base64') });
    } catch (err) {
      this.emit('error', { id: job.id, text: job.text, error: err.message });
    } finally {
      this.processing = false;
      if (this.queue.length) this._processNext();
    }
  }

  _synthesize(text, options = {}) {
    const voiceName = options.voice || 'bg_BG-dimitar-medium';
    const speed = options.speed && options.speed > 0 ? options.speed : 1.0;
    const { model, config, ready } = this.checkVoiceReady(voiceName);

    if (!ready) {
      return Promise.reject(
        new Error(
          `Piper или гласовите файлове липсват. Провери: piper бинарник в ${PIPER_BIN}, модел ${model}, конфиг ${config}`
        )
      );
    }

    // length_scale в Piper: по-голяма стойност = по-бавна реч. Обръщаме "speed" (1 = нормално, 2 = двойно по-бързо)
    const lengthScale = (1 / speed).toFixed(3);

    return new Promise((resolve, reject) => {
      const tmpFile = path.join(os.tmpdir(), `tikbvw-tts-${nanoid(10)}.wav`);
      const args = [
        '--model', model,
        '--config', config,
        '--output_file', tmpFile,
        '--length_scale', String(lengthScale)
      ];

      const child = spawn(PIPER_BIN, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';

      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('error', (err) => {
        reject(new Error(`Не мога да стартирам piper (${PIPER_BIN}): ${err.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Piper излезе с код ${code}: ${stderr.slice(0, 500)}`));
          return;
        }
        fs.readFile(tmpFile, (err, data) => {
          fs.unlink(tmpFile, () => {}); // почистване, без да блокираме отговора
          if (err) return reject(err);
          resolve(data);
        });
      });

      child.stdin.write(text);
      child.stdin.end();
    });
  }
}

export const ttsEngine = new TtsEngine();
export { PIPER_BIN, VOICES_DIR };
