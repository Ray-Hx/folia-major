import { defineConfig } from '@playwright/test';

// WebKit touch layout checks complement (not replace) native simulator/audio tests.
export default defineConfig({
    testDir: './test/ios', workers: 1, timeout: 90000, reporter: 'list',
    use: { browserName: 'webkit', baseURL: 'http://127.0.0.1:4173', isMobile: true, hasTouch: true,
        serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'cross-env FOLIA_IOS=true VITE_LIBRARY_INITIAL_SUITE=grid vite --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 90000 },
});
