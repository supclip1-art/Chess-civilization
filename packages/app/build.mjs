// Сборка Mini App в dist/: бандл приложения (esbuild), index.html и файлы Stockfish из npm-пакета.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'engine'), { recursive: true });

// Имя бандла с хешем содержимого: Telegram и браузеры кешируют app.js, а новое имя гарантирует свежий код.
const result = await build({
  entryPoints: { app: join(here, 'src/main.ts') },
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  sourcemap: true,
  outdir: dist,
  entryNames: '[name].[hash]',
  metafile: true,
  define: {
    __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
    // адрес сервера (оплата, лимит времени) и рекламный блок Adsgram — переменные репозитория CE_API и CE_ADSGRAM_BLOCK;
    // пусто — игра без лимита и покупок, как раньше
    __API__: JSON.stringify(process.env.CE_API ?? ''),
    __ADS__: JSON.stringify(process.env.CE_ADSGRAM_BLOCK ?? ''),
  },
});
const bundle = Object.keys(result.metafile.outputs).find((f) => f.endsWith('.js'));
const bundleName = bundle.split('/').pop();
const html = readFileSync(join(here, 'index.html'), 'utf8').replace('./app.js', `./${bundleName}`).replace('__BUNDLE__', bundleName);
writeFileSync(join(dist, 'index.html'), html);
// Telegram держит старый index.html в кеше: страница сверяет свой бандл с version.json и перезагружается на новую версию
writeFileSync(join(dist, 'version.json'), JSON.stringify({ bundle: bundleName }));

// Stockfish: при установке через npm (workspaces кладут пакеты в корневой node_modules)
const candidates = [join(here, 'node_modules/stockfish/bin'), join(here, '../../node_modules/stockfish/bin')];
const bin = candidates.find((p) => existsSync(join(p, 'stockfish-18-lite-single.js')));
if (bin) {
  for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) cpSync(join(bin, f), join(dist, 'engine', f));
  console.log('stockfish copied from', bin);
} else {
  console.warn('WARNING: stockfish package not found — the engine test will not work in this build');
}
writeFileSync(join(dist, 'engine', 'README.txt'),
  'Stockfish 18 lite (WebAssembly build by nmrugg/stockfish.js) — GNU GPL v3.\n' +
  'Source code: https://github.com/official-stockfish/Stockfish and https://github.com/nmrugg/stockfish.js\n');
// GitHub Pages: не пропускать файлы через Jekyll
writeFileSync(join(dist, '.nojekyll'), '');
console.log('built', dist);
