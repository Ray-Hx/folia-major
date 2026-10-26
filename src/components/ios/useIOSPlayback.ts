import { beginNativeAdoption } from '../../services/ios/nativeAdoption';
import { useEffect, useRef } from 'react';
import type { LocalSong, SongResult } from '../../types';
import type { NavidromeSong } from '../../types/navidrome';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { FoliaNative, isNativeIOS, nativeFileURL, type NativeTrack } from '../../services/ios/native';
import { getSongArtistLabel, getSongAlbumLabel, getSongCoverUrl } from '../../services/onlineMusic/songMetadata';
import { getNavidromeConfig, navidromeApi } from '../../services/navidromeService';
import { resolveNavidromePlaybackCarrier } from '../../utils/appPlaybackGuards';

// Publish fully resolved local/server queues before backgrounding; reconcile the UI on return.
export function useIOSPlayback(localSongs: LocalSong[], playSong: (song: SongResult, queue?: SongResult[]) => unknown) {
    const queue = usePlaybackStore(state => state.playQueue);
    const currentSong = usePlaybackStore(state => state.currentSong);
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const loop = useAudioSettingsStore(state => state.loopMode);
    const mapping = useRef(new Map<string, SongResult>());
    const callback = useRef(playSong);
    callback.current = playSong;
    const reconciling = useRef('');
    useEffect(() => {
        if (!isNativeIOS()) return;
        const tracks: NativeTrack[] = [];
        const nextMap = new Map<string, SongResult>();
        const config = getNavidromeConfig();
        for (const song of queue.length ? queue : currentSong ? [currentSong] : []) {
            const local = localSongs.find(item => item.id === (song as SongResult & { localRef?: { songId: string } }).localRef?.songId);
            const nav = resolveNavidromePlaybackCarrier(song);
            const url = song === currentSong && audioSrc ? audioSrc
                : local?.iosFilePath ? nativeFileURL(local.iosFilePath)
                : config && nav ? navidromeApi.getStreamUrl(config, (nav as NavidromeSong).navidromeData.id) : null;
            // Unresolved provider URLs must never silently skip a track in a native queue.
            if (!url || url.startsWith('blob:')) {
                if (tracks.length) break;
                continue;
            }
            nextMap.set(url, song);
            tracks.push({ url, title: song.name, artist: getSongArtistLabel(song), album: getSongAlbumLabel(song), artwork: getSongCoverUrl(song) || undefined });
        }
        mapping.current = nextMap;
        void FoliaNative.setQueue({ tracks, loop }).catch(error => console.error('[iOSAudio] Queue sync failed', error));
    }, [queue, currentSong, audioSrc, localSongs, loop]);
    useEffect(() => {
        if (!isNativeIOS()) return;
        let disposed = false;
        const reconcile = async () => {
            if (document.hidden || disposed) return;
            const state = await FoliaNative.getState();
            if (disposed || !state.url || state.url === usePlaybackStore.getState().audioSrc || reconciling.current === state.url) return;
            const song = mapping.current.get(state.url);
            if (!song) return;
            reconciling.current = state.url;
            beginNativeAdoption(state.url, state.playing);
            try { await callback.current(song, usePlaybackStore.getState().playQueue); }
            finally { reconciling.current = ''; }
        };
        const safeReconcile = () => { void reconcile().catch(error => console.error('[iOSAudio] Resume sync failed', error)); };
        const listener = FoliaNative.addListener('state', state => { if (state.event === 'trackChanged') safeReconcile(); });
        document.addEventListener('visibilitychange', safeReconcile);
        return () => { disposed = true; void listener.then(handle => handle.remove()); document.removeEventListener('visibilitychange', safeReconcile); };
    }, []);
}
