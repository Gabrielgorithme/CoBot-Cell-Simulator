import { build } from 'esbuild';
import fs from 'node:fs';
const out = process.argv[2] || 'index.html';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: !process.env.NOMIN, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const font = (pkg, fam, w) => { const f = `node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`; return `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format("woff2")}`; };
const fonts = [...[400, 500, 600, 700].map(w => font('ibm-plex-sans', 'IBM Plex Sans', w)), ...[500, 600].map(w => font('ibm-plex-mono', 'IBM Plex Mono', w))].join('\n');
let html = fs.readFileSync('src/template.html', 'utf8');
const ui = fs.existsSync('src/ui.html') ? fs.readFileSync('src/ui.html', 'utf8') : '';
html = html.replace('/*FONTS*/', () => fonts).replace('/*CSS*/', () => fs.readFileSync('src/style.css', 'utf8')).replace('<!--UI-->', () => ui)
  .replace('/*GLB*/', () => fs.readFileSync('assets/ur16e.glb').toString('base64')).replace('/*JS*/', () => js);
fs.writeFileSync(out, html);
console.log(out, (html.length / 1e6).toFixed(2) + ' MB');
