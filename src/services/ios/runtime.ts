import { getStoredString, setStoredString } from '../../stores/storagePrimitives';
import { isNativeIOS } from './native';
import { setGlobalVisualizerFrameRate } from '../../utils/frameRateLimiter';

// Platform defaults apply at runtime without overwriting the user's stored desktop preferences.
export function installIOSRuntime() {
    if (!isNativeIOS()) return;
    document.documentElement.dataset.nativeIos = 'true';
    setGlobalVisualizerFrameRate(60);
    for (const [key, value] of Object.entries({ last_home_view_tab: 'local', reduce_motion_follow_system: 'true' })) {
        if (!getStoredString(key, '')) setStoredString(key, value);
    }
    const viewport = window.visualViewport;
    const resize = () => {
        document.documentElement.style.setProperty('--ios-visible-height', `${viewport?.height ?? window.innerHeight}px`);
    };
    viewport?.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();
}
