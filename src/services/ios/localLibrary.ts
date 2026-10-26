import type { LocalSong } from '../../types';
import { saveLocalSongs } from '../db';
import { parseEmbeddedMetadataAsync } from '../../utils/localMetadataWorkerClient';
import { prepareLocalCoverBlob } from '../localCoverAssetService';
import { buildImportedMetadataSnapshot } from '../../utils/localSongMetadata';
import { FoliaNative, documentWebURL } from './native';

// Import into the existing catalogue; audio remains in the native Documents directory.
export async function readIOSFile(song: LocalSong): Promise<File | null> {
    if (!song.iosFilePath) return null;
    const { uri } = await FoliaNative.getDocument({ path: song.iosFilePath });
    const response = await fetch(documentWebURL(uri));
    if (!response.ok) throw new Error(`Local file read failed: ${response.status}`);
    return new File([await response.blob()], song.fileName, { type: song.mimeType });
}

export async function importIOSDocuments(): Promise<LocalSong[]> {
    const { files } = await FoliaNative.importDocuments();
    const songs: LocalSong[] = [];
    // One file at a time keeps lossless imports from exhausting WKWebView's memory.
    for (const entry of files) {
        const response = await fetch(documentWebURL(entry.uri));
        if (!response.ok) throw new Error(`Import read failed: ${response.status}`);
        const file = new File([await response.blob()], entry.name);
        const meta = await parseEmbeddedMetadataAsync(file, true) ?? {};
        const cover = meta.cover ? await prepareLocalCoverBlob(meta.cover) : null;
        const importedMetadata = buildImportedMetadataSnapshot({
            fileName: entry.name, embeddedTitle: meta.title,
            embeddedArtist: meta.artist, embeddedArtists: meta.artists,
            embeddedAlbum: meta.album,
        });
        const song: LocalSong = {
            id: `ios:${entry.path}`, iosFilePath: entry.path,
            fileName: entry.name, filePath: `iPhone/${entry.name}`, folderName: 'iPhone',
            fileSize: entry.size, mimeType: file.type, duration: meta.duration ?? 0,
            addedAt: Date.now(), title: importedMetadata.title, titleOrigin: 'import', importedMetadata,
            localCoverAssetId: cover?.assetId, localCoverSource: cover?.assetId ? 'embedded' : undefined,
            hasEmbeddedLyrics: Boolean(meta.lyrics), embeddedLyricsContent: meta.lyrics,
            embeddedTranslationLyricsContent: meta.translationLyrics,
            replayGainTrackGain: meta.replayGainTrackGain, replayGainAlbumGain: meta.replayGainAlbumGain,
            trackNumber: meta.trackNumber, discNumber: meta.discNumber,
        };
        // Persist each completed import, so interruption never discards earlier files.
        await saveLocalSongs([song]);
        songs.push(song);
    }
    return songs;
}
