import { FoliaNative } from './native';

// WKWebView blob URLs are private to WebKit. Transfer cached audio in bounded chunks to AVPlayer.
const copies = new Map<string, Promise<string>>();
export function nativeAudioURL(source: string): Promise<string> {
    if (!source.startsWith('blob:')) return Promise.resolve(source);
    const existing = copies.get(source);
    if (existing) return existing;
    const transfer = (async () => {
        const response = await fetch(source);
        const blob = await response.blob();
        if (blob.size > 512 * 1024 * 1024) throw new Error('Cached audio exceeds the 512 MiB native transfer limit');
        const path = `${crypto.randomUUID()}.audio`;
        for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
            const bytes = new Uint8Array(await blob.slice(offset, offset + 192 * 1024).arrayBuffer());
            let binary = '';
            for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
            await FoliaNative.writeAudioChunk({ path, data: btoa(binary), append: offset > 0 });
        }
        return `folia-cache://audio/${path}`;
    })();
    copies.set(source, transfer);
    // Keep references bounded; native cache files are pruned independently at next launch.
    if (copies.size > 8) copies.delete(copies.keys().next().value!);
    void transfer.catch(() => copies.delete(source));
    return transfer;
}
