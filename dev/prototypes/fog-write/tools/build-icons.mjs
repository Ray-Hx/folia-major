// build-icons.mjs: 从 lucide-react（ISC）抽出几个图标的 SVG 节点，生成 icons.js，给雾板用手指画。
// 用法（在 dev/prototypes/fog-write 目录下运行）：node tools/build-icons.mjs <node_modules/lucide-react/dist/esm/icons>
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const NAMES = ['heart', 'star', 'moon', 'sun', 'music', 'music-2', 'flower', 'flower-2', 'sparkles', 'cloud', 'cloud-rain', 'umbrella', 'cat', 'smile', 'snowflake', 'leaf', 'feather'];
const out = {};
for (const n of NAMES) {
  const m = await import(path.join(dir, n + '.mjs'));
  const __iconData = m.__iconData || (await import(path.join(dir, fs.readFileSync(path.join(dir, n + '.mjs'), 'utf8').match(/from '\.\/([^']+)'/)[1]))).__iconData;
  out[n] = __iconData.node.map(([tag, attrs]) => { const { key, ...rest } = attrs; return [tag, rest]; });
}
fs.writeFileSync('icons.js', '// icons.js: lucide 图标（ISC）的 SVG 节点，24×24，由 build-icons.mjs 生成。\nwindow.ICONS = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'icons');
