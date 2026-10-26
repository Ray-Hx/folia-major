import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Build a test bundle, inject an explicit test-only environment, then background the real host.
const device = process.env.FOLIA_SIMULATOR_ID;
if (!device) throw new Error('Set FOLIA_SIMULATOR_ID to an available iPhone simulator UUID (xcrun simctl list devices).');
mkdirSync('ios/output', { recursive: true });
const log = createWriteStream('ios/output/native-tests.log');
let pending = '';
let backgrounded = false;
const receive = chunk => {
    log.write(chunk);
    pending += chunk.toString();
    if (!backgrounded && pending.includes('[FoliaNativeTest] BACKGROUND_READY')) {
        backgrounded = true;
        const result = spawnSync('xcrun', ['simctl', 'launch', device, 'com.apple.Preferences'], { encoding: 'utf8' });
        console.log('Backgrounded test host:', result.status === 0);
    }
    if (pending.length > 20000) pending = pending.slice(-20000);
    const lines = chunk.toString().split('\n').filter(line => /Test Case|Executed |error:|TEST SUCCEEDED|TEST FAILED/.test(line));
    if (lines.length) console.log(lines.join('\n'));
};
const run = args => new Promise((resolve, reject) => {
    const child = spawn('xcodebuild', args, { env: { ...process.env, NSUnbufferedIO: 'YES' } });
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`xcodebuild exited ${code}`)));
});
try {
    await run(['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-destination', `platform=iOS Simulator,id=${device}`,
        '-derivedDataPath', 'ios/DerivedData', 'CODE_SIGNING_ALLOWED=NO', 'build-for-testing']);
    const folder = 'ios/DerivedData/Build/Products';
    const original = readdirSync(folder).find(name => name.endsWith('.xctestrun') && !name.startsWith('FoliaNativeQA'));
    if (!original) throw new Error('No generated xctestrun file found');
    const converted = spawnSync('plutil', ['-convert', 'json', '-o', '-', path.join(folder, original)], { encoding: 'utf8' });
    if (converted.status !== 0) throw new Error(converted.stderr);
    const specification = JSON.parse(converted.stdout);
    const configure = value => {
        if (!value || typeof value !== 'object') return;
        if (value.TestBundlePath) value.EnvironmentVariables = { ...value.EnvironmentVariables, FOLIA_TEST_BACKGROUND: '1' };
        for (const child of Object.values(value)) configure(child);
    };
    configure(specification);
    const target = path.join(folder, 'FoliaNativeQA.xctestrun');
    writeFileSync(target, JSON.stringify(specification));
    const conversion = spawnSync('plutil', ['-convert', 'xml1', target]);
    if (conversion.status !== 0) throw new Error('Failed to serialize test specification');
    await run(['test-without-building', '-xctestrun', target, '-destination', `platform=iOS Simulator,id=${device}`, '-parallel-testing-enabled', 'NO']);
} finally { log.end(); }
