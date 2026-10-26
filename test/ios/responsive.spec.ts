import { installNativeEnvironment } from './nativeEnvironment';
import { test, expect, type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY } from '../helpers/appState';

test.beforeEach(async ({ page }) => { await installNativeEnvironment(page); });

// Exercise actual home, settings and player DOM using WebKit's coarse-pointer viewport.
const sizes = [
    { name: 'small', width: 320, height: 568 },
    { name: 'SE', width: 375, height: 667 },
    { name: 'iPhone16Pro', width: 402, height: 874 },
    { name: 'max', width: 440, height: 852 },
    { name: 'iPhone16Pro-landscape', width: 874, height: 402 },
    { name: 'wide-landscape', width: 852, height: 380 },
];
const assertInside = async (page: Page, selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
};
for (const size of sizes) {
    test(`${size.name}: home, search, settings and rotation remain usable`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize(size);
        await page.addInitScript(({ version, key }) => {
            localStorage.setItem(key, version);
            localStorage.setItem('folia_last_seen_guide_version', version);
            localStorage.setItem('library_suite_prompt_seen', 'true');
            localStorage.setItem('library_suite', 'grid');
            localStorage.setItem('last_home_view_tab', 'local');
            localStorage.setItem('i18nextLng', 'en');
            document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.nativeIos = 'true'; });
        }, { version: APP_VERSION, key: GUIDE_VERSION_STORAGE_KEY });
        await page.goto('/');
        await page.locator('#app-splash').waitFor({ state: 'detached', timeout: 60000 });
        await assertInside(page, '.folia-app-shell');
        await assertInside(page, '.ios-home-search input');
        await page.locator('.ios-home-search input').fill('Test music');
        await expect(page.locator('.ios-home-search input')).toHaveValue('Test music');
        await page.locator('.ios-home-search input').fill('');
        await page.locator('.ios-home-search input').blur();
        await page.waitForTimeout(500);
        await page.evaluate(async () => {
            const path = '/src/stores/useSettingsModalStore.ts';
            const { useSettingsModalStore } = await import(/* @vite-ignore */ path);
            useSettingsModalStore.getState().openSettings('options');
        });
        await expect(page.locator('.ios-settings-window')).toBeVisible();
        // Allow the existing modal entry transition to settle before measuring geometry.
        await page.waitForTimeout(450);
        await assertInside(page, '.ios-settings-window');
        await page.screenshot({ path: `test-results/ios/${size.name}-settings.png` });
        await page.setViewportSize({ width: size.height, height: size.width });
        await page.waitForTimeout(350);
        await assertInside(page, '.ios-settings-window');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(overflow).toBe(false);
        expect(errors).toEqual([]);
    });
}

test('all built-in lyric renderers mount in portrait and landscape', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 402, height: 874 });
    await page.addInitScript(({ version, key }) => {
        localStorage.setItem(key, version);
        localStorage.setItem('folia_last_seen_guide_version', version);
        localStorage.setItem('library_suite_prompt_seen', 'true');
        localStorage.setItem('library_suite', 'grid');
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.nativeIos = 'true'; });
    }, { version: APP_VERSION, key: GUIDE_VERSION_STORAGE_KEY });
    await page.goto('/');
    await page.locator('#app-splash').waitFor({ state: 'detached', timeout: 60000 });
    await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        const [{ useAppViewStore }, { usePlaybackStore }, parser, signals] = await Promise.all([
            load('/src/stores/useAppViewStore.ts'), load('/src/stores/usePlaybackStore.ts'),
            load('/src/utils/lyrics/parserCore.ts'), load('/src/stores/motionSignals.ts'),
        ]);
        usePlaybackStore.setState({
            lyrics: parser.parseLyricsByFormat('lrc', '[00:00.00]Folia 随身而行\n[00:04.00]让音乐与文字一起呼吸\n[00:08.00]A melody in your pocket\n[00:12.00]下一段旅程 即将开始'),
            duration: 16, currentLineIndex: 1, playerState: 'PAUSED',
            currentSong: { id: 'iphone-fixture', name: 'Folia 随身而行', artists: [{ id: 0, name: 'Folia' }], album: { id: 0, name: 'iPhone' }, durationMs: 16000, isLocal: true, localRef: { songId: 'iphone-fixture' }, sourceRef: { kind: 'local', mediaId: 'iphone-fixture' } },
        });
        signals.currentTime.set(5); signals.lyricCurrentTime.set(5);
        useAppViewStore.getState().setView('player');
    });
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
        const path = '/src/stores/motionSignals.ts';
        const signals = await import(/* @vite-ignore */ path);
        signals.currentTime.set(5); signals.lyricCurrentTime.set(5);
    });
    const modes = ['cadenza', 'cappella', 'claddagh', 'classic', 'diorama', 'fume', 'hanabi', 'lumiere', 'monet', 'partita', 'pendolo', 'sonnet', 'still', 'tempera', 'tilt'];
    for (const viewport of [{ width: 402, height: 874 }, { width: 874, height: 402 }]) {
        await page.setViewportSize(viewport);
        for (const mode of modes) {
            await page.evaluate(async mode => {
                const path = '/src/stores/useVisualizerSettingsStore.ts';
                const { useVisualizerSettingsStore } = await import(/* @vite-ignore */ path);
                useVisualizerSettingsStore.getState().handleSetVisualizerMode(mode, { notify: false });
            }, mode);
            await page.waitForTimeout(1200);
            await assertInside(page, '[data-testid="player-visual-surface"]');
            expect(await page.getByTestId('player-visual-surface').evaluate(node => node.childElementCount)).toBeGreaterThan(0);
            const style = page.locator(`[data-visualizer-style="${mode}"]`);
            await expect(style).toBeVisible();
            const frame = await style.boundingBox();
            expect(frame!.x).toBeCloseTo(0, 0); expect(frame!.y).toBeCloseTo(0, 0);
            expect(frame!.width).toBeCloseTo(viewport.width, 0); expect(frame!.height).toBeCloseTo(viewport.height, 0);
            if (mode === 'classic') await expect(page.getByTestId('player-visual-surface')).toContainText('让');
            await page.screenshot({ path: `test-results/ios/lyrics-${mode}-${viewport.width}.png` });
        }
    }
    expect(errors).toEqual([]);
});

test('iPhone panel dock and body remain separate in both orientations', async ({ page }) => {
    await page.addInitScript(({ version, key }) => {
        localStorage.setItem(key, version); localStorage.setItem('folia_last_seen_guide_version', version);
        localStorage.setItem('library_suite_prompt_seen', 'true'); localStorage.setItem('library_suite', 'grid');
    }, { version: APP_VERSION, key: GUIDE_VERSION_STORAGE_KEY });
    await page.goto('/');
    await page.locator('#app-splash').waitFor({ state:'detached', timeout:60000 });
    await page.evaluate(async () => {
        const path = '/src/stores/useAppViewStore.ts'; const {useAppViewStore} = await import(/* @vite-ignore */ path);
        useAppViewStore.getState().setView('player'); useAppViewStore.getState().setPanelTab('controls');
        useAppViewStore.getState().setIsPanelOpen(true);
    });
    for (const viewport of [{width:402,height:874}, {width:874,height:402}]) {
        await page.setViewportSize(viewport); await page.waitForTimeout(500);
        const surface = page.getByTestId('unified-panel-surface');
        await expect(surface).toBeVisible(); await assertInside(page, '[data-testid="unified-panel-surface"]');
        const boxes = await surface.locator('[data-ponder-panel-tab-button]').evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};
        }));
        expect(boxes.length).toBeGreaterThan(3);
        for (let i=0;i<boxes.length;i++) {
            expect(boxes[i].height).toBeGreaterThanOrEqual(40);
            if (i) expect(boxes[i-1].right).toBeLessThanOrEqual(boxes[i].x + 1);
        }
        const dock = await surface.locator('.ios-panel-dock').boundingBox();
        const scroll = await surface.locator('.st-scroll').boundingBox();
        expect(scroll!.y + scroll!.height).toBeLessThanOrEqual(dock!.y + 1);
        await page.screenshot({path:`test-results/ios/control-panel-${viewport.width}.png`});
    }
});

test('tapping the lyric background enters and leaves immersion', async ({ page }) => {
    await page.setViewportSize({width:402,height:874});
    await page.addInitScript(({version,key}) => {
        localStorage.setItem(key,version); localStorage.setItem('folia_last_seen_guide_version',version);
        localStorage.setItem('library_suite_prompt_seen','true'); localStorage.setItem('library_suite','grid');
    }, {version:APP_VERSION,key:GUIDE_VERSION_STORAGE_KEY});
    await page.goto('/');
    await page.locator('#app-splash').waitFor({state:'detached',timeout:60000});
    await page.evaluate(async () => {
        const p = '/src/stores/useAppViewStore.ts'; const c = '/src/stores/useAppChromeStore.ts';
        const {useAppViewStore} = await import(/* @vite-ignore */ p);
        const {useAppChromeStore} = await import(/* @vite-ignore */ c);
        useAppChromeStore.getState().setIsPlayerChromeHidden(false);
        useAppViewStore.getState().setView('player');
    });
    await page.getByTestId('player-visual-surface').click({position:{x:150,y:300}});
    await expect.poll(() => page.evaluate(() => localStorage.getItem('player_chrome_hidden'))).toBe('true');
    await page.getByTestId('player-visual-surface').click({position:{x:150,y:300}});
    await expect.poll(() => page.evaluate(() => localStorage.getItem('player_chrome_hidden'))).toBe('false');
});
