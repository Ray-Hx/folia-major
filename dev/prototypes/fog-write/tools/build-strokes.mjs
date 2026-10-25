// build-strokes.mjs: 从 AnimCJK 的 graphics*.txt 里抽出 demo 用到的字的笔画中线，生成 strokes.js。
// 用法（在 dev/prototypes/fog-write 目录下运行）：node tools/build-strokes.mjs <AnimCJK 仓库目录>
import fs from 'node:fs';
import path from 'node:path';
const src = process.argv[2];
globalThis.window = {};
// 本地测试歌曲可选（不进仓库），只用来报告缺字
if (fs.existsSync('data/vocal-data.js')) await import(path.resolve('data/vocal-data.js'));
const SAMPLE = fs.readFileSync('tools/sample.txt', 'utf8');
const want = new Set([...SAMPLE]);
for (const s of window.VOCAL_DATA || []) for (const l of s.lines) for (const ch of (l.words ? l.words.map(w => w[2]).join('') : l.text)) want.add(ch);
const out = {};
// 收全部字：输入框里随便打的字也要有笔顺（只收 demo 用到的字时，「爹」这类字会退到骨架追踪，笔画多的就糊了）
const ALL = true;
// 假名 → 简体中文 → 日文汉字（中文输入按简体笔顺，日文独有的字形再用日文数据补）
for (const f of ['graphicsJaKana.txt', 'graphicsZhHans.txt', 'graphicsJa.txt']) {
  for (const line of fs.readFileSync(path.join(src, f), 'utf8').split('\n')) {
    if (!line) continue;
    const ch = line.slice(14, line.indexOf('"', 14));
    if ((!ALL && !want.has(ch)) || out[ch]) continue;
    const o = JSON.parse(line);
    // 假名数据里有落在 1024 方格外的辅助笔画（动画裁切用），丢掉
    out[ch] = o.medians.map(m => m.map(([x, y]) => [x, 900 - y])).filter(m => m.every(([x, y]) => x > -20 && x < 1044 && y > -20 && y < 1044));
  }
}
const missing = [...want].filter(c => !out[c] && c.trim());
fs.writeFileSync('strokes.js', '// strokes.js: AnimCJK 笔画中线（Arphic Public License / LGPL），坐标 1024 方格、y 向下。由 build-strokes.mjs 生成。\nwindow.STROKES = ' + JSON.stringify(out) + ';\n');
console.log('chars', Object.keys(out).length, 'missing', missing.join(''));
