import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useAppViewStore } from '../../stores/useAppViewStore';
import { useAppChromeStore } from '../../stores/useAppChromeStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import { FoliaNative, isNativeIOS } from '../../services/ios/native';
import { hasBlockingWindow } from '../../utils/keyboardTargets';

// Keep native transport visibility in step with Folia windows; track progress stays entirely native.
export function useIOSChrome(next: () => void, previous: () => void, openPlayer: () => void) {
    const { t } = useTranslation();
    const callbacks = useRef({ next, previous, openPlayer });
    callbacks.current = { next, previous, openPlayer };
    const source = usePlaybackStore(state => state.audioSrc);
    const view = useAppViewStore(state => state.view);
    const panelOpen = useAppViewStore(state => state.isPanelOpen);
    const hidden = useAppChromeStore(state => state.isPlayerChromeHidden);
    const hideBar = usePlayerChromeSettingsStore(state => state.hidePlayerProgressBar);
    const light = useThemeSettingsStore(state => state.isDaylight);
    useEffect(() => {
        if (!isNativeIOS()) return;
        let last = '';
        const sync = () => {
            const shown = Boolean(source) && !panelOpen && !(hidden && view === 'player') && !hideBar && !document.hidden
                && !hasBlockingWindow() && !document.querySelector('.ios-fullscreen-grid');
            const payload = { shown, light, labels: { play: t('ui.play'), pause: t('ui.pause'),
                previous: t('ui.previousTrack'), next: t('ui.nextTrack'), panel: t('ui.options'), seek: t('ios.seek') } };
            const key = JSON.stringify(payload);
            if (key === last) return;
            last = key;
            document.documentElement.dataset.iosTransportShown = String(shown);
            void FoliaNative.setChrome(payload).catch(error => console.error('[iOSChrome] Presentation failed', error));
        };
        let scheduled: number | undefined;
        const schedule = () => {
            if (scheduled !== undefined) return;
            scheduled = window.setTimeout(() => { scheduled = undefined; sync(); }, 50);
        };
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-folia-keyboard-window'] });
        document.addEventListener('visibilitychange', sync);
        sync();
        return () => { observer.disconnect(); if (scheduled !== undefined) window.clearTimeout(scheduled); document.removeEventListener('visibilitychange', sync); };
    }, [source, view, panelOpen, hidden, hideBar, light, t]);
    useEffect(() => {
        if (!isNativeIOS()) return;
        const toggleImmersion = (event: MouseEvent) => {
            const target = event.target as Element | null;
            const view = useAppViewStore.getState();
            if (view.view !== 'player' || view.isPanelOpen || hasBlockingWindow()
                || !target?.closest('[data-testid="player-visual-surface"]')
                || target.closest('button,a,input,[role="button"],[role="slider"]')) return;
            const chrome = useAppChromeStore.getState();
            chrome.setIsPlayerChromeHidden(!chrome.isPlayerChromeHidden);
        };
        // Capture observes whether the panel was open before the existing background click closes it.
        document.addEventListener('click', toggleImmersion, true);
        return () => document.removeEventListener('click', toggleImmersion, true);
    }, []);
    useEffect(() => {
        if (!isNativeIOS()) return;
        const listener = FoliaNative.addListener('chromeAction', ({ action }) => {
            if (action === 'next') callbacks.current.next();
            if (action === 'previous') callbacks.current.previous();
            if (action === 'panel') {
                callbacks.current.openPlayer();
                const store = useAppViewStore.getState();
                store.setPanelTab('controls'); store.setIsPanelOpen(true);
            }
        });
        return () => { void listener.then(handle => handle.remove()); };
    }, []);
}
