import path from 'path';

/**
 * Когато приложението е опаковано с pkg в .exe, __dirname сочи вътре във
 * виртуалната "snapshot" файлова система на изпълнимия файл, а не към
 * реалната папка на диска. За неща като piper бинарника, гласовите модели
 * и запазените настройки ни трябва РЕАЛЕН път до диска, до папката, в
 * която потребителят е сложил .exe-то.
 *
 * Изчисляваме корена спрямо реално стартирания входен файл (process.argv[1]
 * при `node server.js` / bundle.cjs, или process.execPath при .exe), вместо
 * спрямо местоположението на този конкретен модул — така пътят остава верен
 * независимо дали кодът е разпръснат в src/ (dev режим) или слят в един
 * bundle.cjs файл в корена на проекта (production/.exe режим).
 */
export function getAppRoot() {
  if (process.pkg) {
    // process.execPath = реалният път до самия .exe файл на диска
    return path.dirname(process.execPath);
  }
  return path.dirname(process.argv[1]);
}

export function isPackaged() {
  return Boolean(process.pkg);
}
