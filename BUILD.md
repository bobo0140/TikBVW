# Компилиране на Windows .exe

Готовите .exe пакети се публикуват в GitHub Releases на repo-то. Ако искаш
да го компилираш сам (например след промени в кода):

```bash
# 1. Инсталирай зависимостите (включително devDependencies)
npm install

# 2. Слей ESM кода в един CommonJS файл (pkg работи по-стабилно с CJS)
npx esbuild server.js --bundle --platform=node --target=node18 \
  --format=cjs --outfile=dist-build/bundle.cjs \
  --external:bufferutil --external:utf-8-validate

# 3. Копирай public/ до bundle-а, за да съвпадат относителните пътища
mkdir -p dist-build/public
cp -r public/* dist-build/public/

# 4. Мини pkg конфигурация в dist-build/package.json
cat > dist-build/package.json << 'JSON'
{
  "name": "tikbvw",
  "version": "1.0.0",
  "bin": "bundle.cjs",
  "pkg": { "assets": ["public/**/*"], "targets": ["node22-win-x64"] }
}
JSON

# 5. Компилирай самия .exe
cd dist-build
npx --yes @yao-pkg/pkg . --targets node22-win-x64 --output ../dist/TikBVW.exe
cd ..
```

## Сглобяване на пълния пакет за разпространение

`TikBVW.exe` сам по себе си не съдържа Piper — той е нативен бинарник и
трябва да стои като реален файл до .exe-то (не може да бъде "вграден" в
snapshot-а на pkg, защото операционната система трябва да го зареди
директно, заедно с неговите .dll библиотеки).

```
dist/TikBVW-Windows/
  TikBVW.exe                          <- компилиран по-горе
  piper/                               <- разархивирано от piper_windows_amd64.zip
    piper.exe
    *.dll
    espeak-ng-data/
  voices/                              <- крайният потребител слага .onnx тук
  ПРОЧЕТИ_МЕ.txt
```

Windows Piper бинарникът се сваля от:
<https://github.com/rhasspy/piper/releases> (файл `piper_windows_amd64.zip`).

Целият `dist/TikBVW-Windows/` се компресира в ZIP и това е файлът, който
се дава на крайния потребител — разархивира, слага гласовите файлове,
щраква `TikBVW.exe`.

## Защо esbuild + pkg, а не направо pkg?

Проектът е писан в ESM (`"type": "module"`). `pkg`/`@yao-pkg/pkg` работят
по-надеждно с CommonJS входна точка, затова първо сливаме всичко в един
`.cjs` файл с esbuild, после него компилираме в `.exe`. `src/appPaths.js`
изчислява пътищата до `piper/`, `voices/` и `data/` спрямо реалното
местоположение на изпълнимия файл на диска (не спрямо вградения snapshot),
за да работят коректно и в двата режима (dev с `node server.js` и
production `.exe`).
