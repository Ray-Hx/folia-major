import { nativeAudioURL } from './blobAudio';
import { peekNativeAdoption, finishNativeAdoption } from './nativeAdoption';
import { FoliaNative, type NativeAudioState } from './native';

// Only the app's registered playback element is adapted; no browser prototypes are changed.
// The existing transport, lyric clock and seeking code keep their HTMLMediaElement contract.
export function attachNativeAudio(element: HTMLAudioElement, readSource: () => string | undefined) {
    let state: NativeAudioState = { url: '', position: 0, duration: 0, playing: false, event: '' };
    let updatedAt = performance.now();
    let disposed = false;
    let volume = 1;
    let muted = false;
    let error: MediaError | null = null;
    let pendingLoad: Promise<unknown> = Promise.resolve();
    let loadedSource = '';
    const emit = (name: string) => element.dispatchEvent(new Event(name));
    const apply = (next: NativeAudioState) => {
        if (disposed || next.url !== readSource()) return;
        const wasPlaying = state.playing;
        const wasEnded = state.event === 'ended';
        const wasDuration = state.duration;
        state = next;
        updatedAt = performance.now();
        if (next.error) {
            error = { code: 4, message: next.error } as MediaError;
            emit('error');
            return;
        }
        error = null;
        if (next.duration > 0 && next.duration !== wasDuration) {
            emit('loadedmetadata');
            emit('durationchange');
            emit('canplay');
        }
        if (next.playing !== wasPlaying) {
            emit(next.playing ? 'play' : 'pause');
            if (next.playing) emit('playing');
        }
        emit('timeupdate');
        if (next.event === 'seeked') emit('seeked');
        if (next.event === 'ended' && !wasEnded) emit('ended');
    };
    const fail = (cause: unknown) => {
        console.error('[iOSAudio] Native operation failed', cause);
        error = { code: 4, message: String(cause) } as MediaError;
        emit('error');
    };
    const load = () => {
        const source = readSource() ?? '';
        if (!source || source === loadedSource) return pendingLoad;
        loadedSource = source;
        error = null;
        emit('loadstart');
        pendingLoad = pendingLoad.catch(() => {}).then(async () => {
            if (disposed || source !== readSource()) return;
            const nativeURL = await nativeAudioURL(source);
            if (disposed || source !== readSource()) return;
            apply(await FoliaNative.load({ url: source, nativeURL }));
        });
        return pendingLoad;
    };
    const originalGetAttribute = element.getAttribute.bind(element);
    Object.defineProperties(element, {
        currentTime: { configurable: true, get: () => {
            const elapsed = state.playing && !document.hidden ? (performance.now() - updatedAt) / 1000 : 0;
            return Math.min(state.duration || Infinity, state.position + elapsed);
        }, set: (position: number) => {
            if (!Number.isFinite(position) || peekNativeAdoption(readSource() ?? '')) return;
            state = { ...state, position: Math.max(0, position) };
            updatedAt = performance.now();
            void pendingLoad.then(() => FoliaNative.seek({ position })).catch(fail);
        } },
        duration: { configurable: true, get: () => state.duration || NaN },
        paused: { configurable: true, get: () => !state.playing },
        ended: { configurable: true, get: () => state.event === 'ended' },
        currentSrc: { configurable: true, get: () => readSource() ?? '' },
        src: { configurable: true, get: () => readSource() ?? '' },
        readyState: { configurable: true, get: () => state.duration > 0 ? 4 : 0 },
        error: { configurable: true, get: () => error },
        volume: { configurable: true, get: () => volume, set: (value: number) => {
            volume = Math.min(1, Math.max(0, value));
            void FoliaNative.setVolume({ volume: muted ? 0 : volume }).catch(fail);
        } },
        muted: { configurable: true, get: () => muted, set: (value: boolean) => {
            muted = value;
            void FoliaNative.setVolume({ volume: muted ? 0 : volume }).catch(fail);
        } },
    });
    element.getAttribute = name => name === 'src' ? readSource() ?? null : originalGetAttribute(name);
    element.load = () => { void load().catch(fail); };
    element.play = async () => {
        await load();
        if (disposed) return;
        const adopted = finishNativeAdoption(readSource() ?? '');
        if (!adopted || adopted.playing) await FoliaNative.play();
        apply(await FoliaNative.getState());
    };
    element.pause = () => {
        void FoliaNative.getState().then(current => {
            if (current.url === readSource() && !peekNativeAdoption(current.url)) return FoliaNative.pause();
        }).catch(fail);
    };
    const listener = FoliaNative.addListener('state', apply);
    const refresh = () => { if (!document.hidden) void FoliaNative.getState().then(apply).catch(fail); };
    document.addEventListener('visibilitychange', refresh);
    return {
        load,
        dispose: () => {
            disposed = true;
            void listener.then(handle => handle.remove());
            document.removeEventListener('visibilitychange', refresh);
        },
    };
}
