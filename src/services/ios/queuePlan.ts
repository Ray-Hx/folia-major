// Keep the contiguous playable region containing the current track; never skip unresolved tracks.
export interface QueueCandidate<T> { key: string; url: string | null; value: T }
export function planNativeQueue<T>(entries: QueueCandidate<T>[], currentKey: string, loop: string) {
    const index = entries.findIndex(entry => entry.key === currentKey);
    if (index < 0 || !entries[index].url) return { entries: [], loop: 'off' };
    let first = index;
    let last = index + 1;
    while (first > 0 && entries[first - 1].url) first--;
    while (last < entries.length && entries[last].url) last++;
    return { entries: entries.slice(first, last), loop: loop === 'one' || (first === 0 && last === entries.length) ? loop : 'off' };
}
