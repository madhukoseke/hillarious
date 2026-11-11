// Builds the single offline index.html from src/ (TD-14).
//
//   src/index.html     the page: head, markup, and three marker lines
//   src/style.css      replaces <!-- build:style -->
//   src/game/*.js      fragments of the one game script, joined in file-name order, replace <!-- build:game -->.
//                      Files up to 11-autopilot-storage.js are the engine (it ends with the headless return);
//                      the rest is the presentation layer. They are slices of one script, not modules.
//   src/render3d/      ES modules bundled with esbuild into one script (the diorama stage), replacing
//                      <!-- build:render3d --> when the page has that marker.
//
//   node tools/build.mjs           write index.html
//   node tools/build.mjs --check   exit 1 if index.html is not what src/ builds (CI)
//
// readSources and assemble need no installs, so the headless tests can check the committed index.html without
// node_modules. Only bundling src/render3d/ loads esbuild.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readSources(root = ROOT) {
  const src = path.join(root, 'src'), gameDir = path.join(src, 'game');
  const files = fs.readdirSync(gameDir).filter((f) => f.endsWith('.js')).sort();
  return {
    template: fs.readFileSync(path.join(src, 'index.html'), 'utf8'),
    style: fs.readFileSync(path.join(src, 'style.css'), 'utf8'),
    game: files.map((f) => fs.readFileSync(path.join(gameDir, f), 'utf8')).join(''),
    gameFiles: files,
  };
}

// Swap each marker line (with its newline) for its content. Content must end with a newline, like the line it
// replaces, so the output keeps the template's line structure.
export function assemble({ template, style, game, render3d = null }) {
  const parts = { style, game, render3d };
  const out = template.replace(/^<!-- build:(\w+) -->\n/gm, (_, name) => {
    if (!(name in parts)) throw new Error(`src/index.html: unknown marker build:${name}`);
    const text = parts[name];
    if (typeof text !== 'string') throw new Error(`build:${name} has no content (is src/render3d/ missing?)`);
    if (!text.endsWith('\n')) throw new Error(`build:${name} must end with a newline`);
    if (name !== 'style' && /<\/script|<!--/i.test(text)) throw new Error(`build:${name} contains "</script" or "<!--", which would break the inline script`);
    return text;
  });
  for (const name of ['style', 'game']) if (!template.includes(`<!-- build:${name} -->\n`)) throw new Error(`src/index.html: missing <!-- build:${name} -->`);
  return out;
}

// The inlined render3d bundle in a built page, so a check can rebuild everything else without esbuild.
export function extractRender3d(html) {
  const m = html.match(/<script id="render3d">\n([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}

export async function bundleRender3d(root = ROOT) {
  const entry = path.join(root, 'src/render3d/index.js');
  if (!fs.existsSync(entry)) return null;
  const { build } = await import('esbuild');
  const res = await build({
    entryPoints: [entry], bundle: true, format: 'iife', globalName: 'HILL3D', minify: true, legalComments: 'none',
    target: ['es2020', 'chrome90', 'firefox90', 'safari15'], write: false, logLevel: 'warning',
  });
  const code = res.outputFiles[0].text;
  return code.endsWith('\n') ? code : code + '\n';
}

export function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) return { line: i + 1, want: la[i], got: lb[i] };
  return null;
}

async function main() {
  const check = process.argv.includes('--check');
  const target = path.join(ROOT, 'index.html');
  const html = assemble({ ...readSources(), render3d: await bundleRender3d() });
  if (check) {
    const current = fs.readFileSync(target, 'utf8');
    if (current === html) { console.log('index.html is up to date'); return; }
    const d = firstDiff(html, current);
    console.error(`index.html is not what src/ builds (first difference at line ${d.line}). Edit src/, then run: npm run build`);
    process.exit(1);
  }
  fs.writeFileSync(target, html);
  console.log(`index.html: ${html.split('\n').length - 1} lines, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}
