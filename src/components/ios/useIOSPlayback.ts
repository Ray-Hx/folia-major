import { planNativeQueue } from '../../services/ios/queuePlan';
import { beginNativeAdoption } from '../../services/ios/nativeAdoption';
import { useEffect, useRef } from 'react';
import type { LocalSong, SongResult } from '../../types';
import type { NavidromeSong } from '../../types/navidrome';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { FoliaNative, isNativeIOS, nativeFileURL, type NativeTrack } from '../../services/ios/native';
import { getSongArtistLabel, getSongAlbumLabel, getSongCoverUrl } from '../../services/onlineMusic/songMetadata';
import { getNavidromeConfig, navidromeApi } from '../../services/navidromeService';
import { getPlaybackSongKey, resolveNavidromePlaybackCarrier } from '../../utils/appPlaybackGuards';
import type { PlaybackNavigationOptions } from '../../types/appPlayback';

// Publish fully resolved local/server queues before backgrounding; reconcile the UI on return.
export function useIOSPlayback(localSongs: LocalSong[], playSong: (song: SongResult, queue?: SongResult[], isFmCall?: boolean, options?: PlaybackNavigationOptions) => unknown) {
    const queue = usePlaybackStore(state => state.playQueue);
    const currentSong = usePlaybackStore(state => state.currentSong);
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const loop = useAudioSettingsStore(state => state.loopMode);
    const mapping = useRef(new Map<string, SongResult>());
    const callback = useRef(playSong);
    const publishedQueue = useRef('');
    callback.current = playSong;
    const reconciling = useRef('');
    useEffect(() => {
        if (!isNativeIOS()) return;
        const tracks: NativeTrack[] = [];
        const nextMap = new Map<string, SongResult>();
        const config = getNavidromeConfig();
        const localsById = new Map(localSongs.map(item => [item.id, item]));
        const currentKey = currentSong ? getPlaybackSongKey(currentSong) : '';
        const candidates = (queue.length ? queue : currentSong ? [currentSong] : []).map(song => {
            const local = localsById.get((song as SongResult & { localRef?: { songId: string } }).localRef?.songId ?? '');
            const nav = resolveNavidromePlaybackCarrier(song);
            const key = getPlaybackSongKey(song);
            const url = currentKey && key === currentKey && audioSrc ? audioSrc
                : local?.iosFilePath ? nativeFileURL(local.iosFilePath)
                : config && nav ? navidromeApi.getStreamUrl(config, (nav as NavidromeSong).navidromeData.id) : null;
            return { key, url, value: song };
        });
        const plan = planNativeQueue(candidates, currentKey, loop);
        for (const { url, value: song } of plan.entries) {
            if (!url) continue;
            nextMap.set(url, song);
            tracks.push({ url, title: song.name, artist: getSongArtistLabel(song), album: getSongAlbumLabel(song), artwork: getSongCoverUrl(song) || undefined });
        }
        mapping.current = nextMap;
        const signature = JSON.stringify({ tracks, loop: plan.loop });
        if (signature === publishedQueue.current) return;
        publishedQueue.current = signature;
        void FoliaNative.setQueue({ tracks, loop: plan.loop }).catch(error => {
            if (publishedQueue.current === signature) publishedQueue.current = '';
            console.error('[iOSAudio] Queue sync failed', error);
        });
    }, [queue, currentSong, audioSrc, localSongs, loop]);
    useEffect(() => {
        if (!isNativeIOS()) return;
        let disposed = false;
        const reconcile = async () => {
            if (document.hidden || disposed) return;
            const sourceBefore = usePlaybackStore.getState().audioSrc;
            if (!sourceBefore) return;
            const state = await FoliaNative.getState();
            const current = usePlaybackStore.getState();
            if (disposed || document.hidden || current.audioSrc !== sourceBefore || !state.url || state.url === current.audioSrc || reconciling.current === state.url) return;
            const song = mapping.current.get(state.url);
            if (!song) return;
            reconciling.current = state.url;
            beginNativeAdoption(state.url, state.playing);
            try { await callback.current(song, current.playQueue, current.isFmMode, { shouldNavigateToPlayer: false }); }
            finally { reconciling.current = ''; }
        };
        const safeReconcile = () => { void reconcile().catch(error => console.error('[iOSAudio] Resume sync failed', error)); };
        const listener = FoliaNative.addListener('state', state => { if (state.event === 'trackChanged') safeReconcile(); });
        document.addEventListener('visibilitychange', safeReconcile);
        return () => { disposed = true; void listener.then(handle => handle.remove()); document.removeEventListener('visibilitychange', safeReconcile); };
    }, []);
}
