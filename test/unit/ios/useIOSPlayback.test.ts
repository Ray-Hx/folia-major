// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';

// A late native state must never undo a newer song selected in the library.
const native = vi.hoisted(() => ({ getState: vi.fn(), setQueue: vi.fn(), addListener: vi.fn() }));
vi.mock('../../../src/services/ios/native', () => ({
    FoliaNative: native, isNativeIOS: () => true, nativeFileURL: (path: string) => `folia-local://library/${path}`,
}));
import { useIOSPlayback } from '../../../src/components/ios/useIOSPlayback';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const first = { id: 'a', name: 'A', artists: [], album: { id: 0, name: '' }, isLocal: true, localRef: { songId: 'a' }, sourceRef: { kind: 'local', mediaId: 'a' } } as SongResult;
const second = { ...first, id: 'b', name: 'B', localRef: { songId: 'b' }, sourceRef: { kind: 'local', mediaId: 'b' } } as SongResult;
const localSongs = [{ id: 'a', iosFilePath: 'a' }, { id: 'b', iosFilePath: 'b' }] as Parameters<typeof useIOSPlayback>[0];
let notify: (state: { event: string }) => void;
const play = vi.fn();
const Probe = () => { useIOSPlayback(localSongs, play); return null; };
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    native.setQueue.mockResolvedValue(undefined);
    native.addListener.mockImplementation(async (_event, callback) => { notify = callback; return { remove: vi.fn() }; });
    usePlaybackStore.setState({ audioSrc: 'folia-local://library/a', currentSong: first, playQueue: [first, second], isFmMode: false });
    root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(Probe)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe('iOS playback reconciliation', () => {
    it('does not replay a stale native track after a new library selection', async () => {
        let finish!: (value: unknown) => void;
        native.getState.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        await act(async () => { notify({ event: 'trackChanged' }); });
        await act(async () => { usePlaybackStore.setState({ audioSrc: 'new-selected-url' }); });
        await act(async () => { finish({ url: 'folia-local://library/b', playing: true }); });
        expect(play).not.toHaveBeenCalled();
    });

    it('adopts an actual native queue advance without changing the visible page', async () => {
        native.getState.mockResolvedValue({ url: 'folia-local://library/b', playing: true });
        await act(async () => { notify({ event: 'trackChanged' }); });
        expect(play).toHaveBeenCalledWith(second, [first, second], false, { shouldNavigateToPlayer: false });
    });
});
