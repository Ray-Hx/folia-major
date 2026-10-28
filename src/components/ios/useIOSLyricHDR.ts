import { useEffect } from 'react';
import { FoliaNative, isNativeIOS } from '../../services/ios/native';
import { useAppViewStore } from '../../stores/useAppViewStore';
import { hasBlockingWindow } from '../../utils/keyboardTargets';

// Update native EDR glows only for active classic words, without driving React at animation speed.
export function useIOSLyricHDR() {
    useEffect(() => {
        if (!isNativeIOS()) return;
        let timer = 0;
        let lastSent = '';
        let pending = false;
        let stopped = false;
        const update = () => {
            if (stopped) return;
            const view = useAppViewStore.getState();
            const allowed = !document.hidden && view.view === 'player' && !view.isPanelOpen && !hasBlockingWindow();
            timer = window.setTimeout(update, allowed ? 100 : 500);
            if (pending) return;
            const regions = allowed ? Array.from(document.querySelectorAll<HTMLElement>('[data-ios-hdr-active]')).slice(0, 4).map(element => {
                const box = element.getBoundingClientRect();
                return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
            }).filter(box => box.width > 0 && box.height > 0) : [];
            const signature = JSON.stringify(regions);
            if (signature === lastSent) return;
            lastSent = signature;
            pending = true;
            void FoliaNative.setLyricHDR({ regions }).catch(error => {
                lastSent = '';
                console.warn('[iOSLyricHDR] Could not update highlight', error);
            }).finally(() => { pending = false; });
        };
        void FoliaNative.lyricHDRCapabilities().then(({ supported }) => {
            if (!stopped && supported) update();
        }).catch(error => console.warn('[iOSLyricHDR] Capability check failed', error));
        return () => {
            stopped = true;
            window.clearTimeout(timer);
            void FoliaNative.setLyricHDR({ regions: [] }).catch(error => console.warn('[iOSLyricHDR] Could not clear highlight', error));
        };
    }, []);
}
