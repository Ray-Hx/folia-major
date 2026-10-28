// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Native highlights are bounded to visible lyric words and clear when a panel opens.
const native = vi.hoisted(() => ({ lyricHDRCapabilities: vi.fn(), setLyricHDR: vi.fn() }));
const app = vi.hoisted(() => ({ view: 'player', isPanelOpen: false }));
vi.mock('../../../src/services/ios/native', () => ({ isNativeIOS: () => true, FoliaNative: native }));
vi.mock('../../../src/stores/useAppViewStore', () => ({ useAppViewStore: { getState: () => app } }));
vi.mock('../../../src/utils/keyboardTargets', () => ({ hasBlockingWindow: () => false }));
import { useIOSLyricHDR } from '../../../src/components/ios/useIOSLyricHDR';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const Probe = () => { useIOSLyricHDR(); return null; };
let root: ReturnType<typeof createRoot>;
let element: HTMLElement;
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    app.view = 'player'; app.isPanelOpen = false;
    native.lyricHDRCapabilities.mockResolvedValue({ supported: true });
    native.setLyricHDR.mockResolvedValue(undefined);
    element = document.createElement('span'); element.dataset.iosHdrActive = '';
    element.getBoundingClientRect = () => ({ x: 25, y: 90, width: 100, height: 32 } as DOMRect);
    document.body.append(element);
    root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.useRealTimers(); });

it('tracks an active word and removes its native glow when controls cover it', async () => {
    await act(async () => { root.render(createElement(Probe)); });
    expect(native.setLyricHDR).toHaveBeenCalledWith({ regions: [{ x: 25, y: 90, width: 100, height: 32 }] });
    app.isPanelOpen = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(native.setLyricHDR).toHaveBeenLastCalledWith({ regions: [] });
});
