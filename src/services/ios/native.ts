import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Typed boundary to the iOS audio engine and sandboxed document library.
export const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export interface NativeTrack {
    url: string;
    title: string;
    artist: string;
    album: string;
    artwork?: string;
}
export interface NativeAudioState {
    url: string;
    position: number;
    duration: number;
    playing: boolean;
    advancing?: boolean;
    event: string;
    error?: string;
}
export interface ImportedDocument {
    path: string;
    name: string;
    size: number;
    uri: string;
}
interface FoliaNativePlugin {
    setChrome(options: { shown: boolean; light: boolean; labels: Record<string, string> }): Promise<void>;
    addListener(name: 'chromeAction', callback: (state: { action: string }) => void): Promise<PluginListenerHandle>;
    load(options: { url: string; nativeURL?: string }): Promise<NativeAudioState>;
    writeAudioChunk(options: { path: string; data: string; append: boolean }): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(options: { position: number }): Promise<void>;
    setVolume(options: { volume: number }): Promise<void>;
    setQueue(options: { tracks: NativeTrack[]; loop: string }): Promise<void>;
    getState(): Promise<NativeAudioState>;
    importDocuments(): Promise<{ files: ImportedDocument[] }>;
    getDocument(options: { path: string }): Promise<{ uri: string }>;
    neteaseWebLogin(): Promise<{ cookie?: string; cancelled?: boolean }>;
    addListener(name: 'state', callback: (state: NativeAudioState) => void): Promise<PluginListenerHandle>;
}
export const FoliaNative = registerPlugin<FoliaNativePlugin>('FoliaNative');
export const nativeFileURL = (path: string) => `folia-local://library/${encodeURIComponent(path)}`;
export const documentWebURL = (uri: string) => Capacitor.convertFileSrc(uri);
