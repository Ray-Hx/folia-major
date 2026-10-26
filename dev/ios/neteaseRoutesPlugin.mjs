import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Reuse the pinned upstream's pure request modules without its Node HTTP server or filesystem.
export function iosNeteaseRoutesPlugin() {
    const id = 'virtual:ios-netease-routes';
    return {
        name: 'ios-netease-routes',
        resolveId(source) { if (source === id) return '\0' + id; },
        load(source) {
            if (source !== '\0' + id) return;
            const folder = path.resolve('node_modules/@neteasecloudmusicapienhanced/api/module');
            const entries = [];
            for (const file of readdirSync(folder).sort()) {
                if (!file.endsWith('.js')) continue;
                const code = readFileSync(path.join(folder, file), 'utf8');
                const dependencies = [...code.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
                if (dependencies.some(name => name !== '../util/option.js') || /\b(process|Buffer|global|eval)\b/.test(code)) continue;
                const name = file.slice(0, -3);
                entries.push(`${JSON.stringify(name)}: (() => { const module = {exports:{}}; const require = () => upstreamCreateOption; ${code}\n return module.exports; })()`);
            }
            return `const upstreamCreateOption = query => ({cookie:query.cookie, crypto:'api'});\nexport default {${entries.join(',\n')}};`;
        },
    };
}
