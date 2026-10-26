import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

// Reproducible simulator/archive/export entry points; signing credentials remain in Xcode.
const mode = process.argv[2];
const run = args => {
    const result = spawnSync('xcodebuild', args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
};
const common = ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-derivedDataPath', 'ios/DerivedData'];
if (mode === 'simulator') {
    run([...common, '-configuration', 'Debug', '-destination', 'generic/platform=iOS Simulator', 'CODE_SIGNING_ALLOWED=NO', 'build']);
} else if (mode === 'archive') {
    mkdirSync('ios/output', { recursive: true });
    run([...common, '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', 'ios/output/Folia.xcarchive',
        ...(process.env.FOLIA_TEAM_ID ? [`DEVELOPMENT_TEAM=${process.env.FOLIA_TEAM_ID}`] : []),
        ...(process.env.FOLIA_UNSIGNED === '1' ? ['CODE_SIGNING_ALLOWED=NO'] : []), 'archive']);
} else if (mode === 'export') {
    const options = process.env.FOLIA_EXPORT_OPTIONS;
    if (!options || !existsSync(options)) throw new Error('Set FOLIA_EXPORT_OPTIONS to your signing ExportOptions.plist. See docs/ios/README.md.');
    run(['-exportArchive', '-archivePath', 'ios/output/Folia.xcarchive', '-exportPath', 'ios/output', '-exportOptionsPlist', options]);
} else {
    throw new Error('Expected simulator, archive or export');
}
