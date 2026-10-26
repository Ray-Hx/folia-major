import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachNativeAudio } from '../../../src/services/ios/audioElementAdapter';
import { beginNativeAdoption } from '../../../src/services/ios/nativeAdoption';
import type { NativeAudioState } from '../../../src/services/ios/native';

// Exercise transport races using the same event contract the React player consumes.
const native = vi.hoisted(() => ({
    load: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), getState: vi.fn(), addListener: vi.fn(),
}));
vi.mock('../../../src/services/ios/native', () => ({ FoliaNative: native }));
vi.mock('../../../src/services/ios/blobAudio', () => ({ nativeAudioURL: async (url: string) => url }));
let listener: (state: NativeAudioState) => void;
let source: string;
let state: NativeAudioState;
let adapter: ReturnType<typeof attachNativeAudio>;
let element: HTMLAudioElement;
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
    source = 'https://audio.test/a.mp3';
    state = { url: source, position: 0, duration: 60, playing: false, event: 'state' };
    native.addListener.mockImplementation(async (_name, callback) => { listener = callback; return { remove: vi.fn() }; });
    native.load.mockImplementation(async ({ url }) => ({ ...state, url }));
    native.getState.mockImplementation(async () => state);
    for (const key of ['play', 'pause', 'seek', 'setVolume'] as const) native[key].mockResolvedValue(undefined);
    element = Object.assign(new EventTarget(), { getAttribute: (_name: string) => null }) as unknown as HTMLAudioElement;
    adapter = attachNativeAudio(element, () => source);
});
afterEach(() => { adapter.dispose(); vi.unstubAllGlobals(); });
describe('native audio transport', () => {
    it('serializes rapid source changes and rejects an overtaken play request', async () => {
        let release!: (state: NativeAudioState) => void;
        native.load.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const playing = element.play();
        const rejection = expect(playing).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(native.load).toHaveBeenCalledTimes(1));
        source = 'https://audio.test/b.mp3';
        const loading = adapter.load();
        release(state);
        await loading; await rejection;
        expect(native.load.mock.calls.map(([args]) => args.url)).toEqual(['https://audio.test/a.mp3', 'https://audio.test/b.mp3']);
        expect(native.play).not.toHaveBeenCalled();
    });
    it('delivers ended and errors once, ignoring the inactive source', () => {
        const ended = vi.fn(), error = vi.fn();
        element.addEventListener('ended', ended); element.addEventListener('error', error);
        listener({ ...state, url: 'inactive', event: 'ended' });
        listener({ ...state, event: 'ended' }); listener({ ...state, event: 'ended' });
        expect(ended).toHaveBeenCalledTimes(1);
        listener({ ...state, error: 'Unsupported format' }); listener({ ...state, error: 'Unsupported format' });
        expect(error).toHaveBeenCalledTimes(1);
        expect(element.error?.message).toBe('Unsupported format');
    });
    it('adopts a lock-screen pause without resetting progress or resuming audio', async () => {
        state = { ...state, position: 23, playing: false };
        beginNativeAdoption(source, false);
        element.addEventListener('loadedmetadata', () => { element.currentTime = 0; });
        await element.play();
        expect(element.currentTime).toBe(23);
        expect(native.seek).not.toHaveBeenCalled();
        expect(native.play).not.toHaveBeenCalled();
    });
    it('does not advance the lyric clock during native buffering', () => {
        listener({ ...state, position: 7, playing: true, advancing: false });
        expect(element.currentTime).toBe(7);
    });
});
