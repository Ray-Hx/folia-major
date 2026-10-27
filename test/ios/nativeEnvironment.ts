import type { Page } from '@playwright/test';

// Exercise the iOS React branches in WebKit; audio/material behavior is tested separately by XCTest.
export async function installNativeEnvironment(page: Page) {
    await page.addInitScript(() => {
        const host = window as any;
        host.CapacitorCustomPlatform = { name: 'ios' };
        const methods = ['load', 'play', 'pause', 'seek', 'setVolume', 'setQueue', 'getState', 'setChrome', 'writeAudioChunk', 'getDocument', 'importDocuments', 'neteaseWebLogin', 'removeListener'];
        const state = { url: '', position: 0, duration: 0, playing: false, event: 'state' };
        host.Capacitor = {
            PluginHeaders: [
                { name: 'FoliaNative', methods: [...methods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }] },
                { name: 'CapacitorHttp', methods: ['request','get','post','put','patch','delete'].map(name => ({ name, rtype: 'promise' })) },
            ],
            nativeCallback: () => 'layout-listener',
            nativePromise: async (plugin: string, method: string) => {
                if (plugin === 'CapacitorHttp') return { status: 200, data: { code: 301 }, headers: {} };
                if (method === 'getState' || method === 'load') return state;
                if (method === 'neteaseWebLogin') return { cancelled: true };
                return {};
            },
        };
    });
}
