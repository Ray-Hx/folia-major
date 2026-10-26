import { describe, expect, it, vi, afterEach } from 'vitest';
import { beginNativeAdoption, finishNativeAdoption, peekNativeAdoption } from '../../../src/services/ios/nativeAdoption';

// Queue reconciliation must preserve both the track position and the user's lock-screen pause.
afterEach(() => vi.useRealTimers());
describe('native background track adoption', () => {
    it('does not consume another track and preserves pause intent exactly once', () => {
        beginNativeAdoption('folia-local://library/song.m4a', false);
        expect(finishNativeAdoption('another-track')).toBeNull();
        expect(finishNativeAdoption('folia-local://library/song.m4a')?.playing).toBe(false);
        expect(peekNativeAdoption('folia-local://library/song.m4a')).toBeNull();
    });
    it('expires an abandoned reconciliation so later user controls work', () => {
        vi.useFakeTimers();
        beginNativeAdoption('song', true);
        vi.advanceTimersByTime(10001);
        expect(peekNativeAdoption('song')).toBeNull();
    });
});
