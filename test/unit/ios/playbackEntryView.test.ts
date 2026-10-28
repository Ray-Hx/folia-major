import { afterEach, describe, expect, it, vi } from 'vitest';

// iPhone starts in the library unless the listener chose another playback destination.
vi.mock('../../../src/services/ios/native', () => ({ isNativeIOS: () => true }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function load(initial?: string) {
    vi.resetModules();
    const values = new Map<string, string>();
    if (initial !== undefined) values.set('playback_entry_view', initial);
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    return (await import('../../../src/stores/usePlaybackEntryViewStore')).usePlaybackEntryViewStore.getState().playbackEntryView;
}

describe('iPhone playback destination', () => {
    it('stays in the library by default and preserves explicit choices', async () => {
        expect(await load()).toBe('stay');
        expect(await load('player')).toBe('player');
        expect(await load('lattice')).toBe('lattice');
    });
});
