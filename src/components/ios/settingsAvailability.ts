import { isNativeIOS } from '../../services/ios/native';

// iPhone capability policy shared by setting rows, group headings, navigation and search.
const UNAVAILABLE = new Set([
    'interaction', 'desktop', 'mods', 'developer',
    // Desktop windows and tutorial controls.
    'alwaysShowMainWindowTitlebar', 'ponderHints', 'localLibraryWatch',
    // The native transport owns its position, buttons and track metadata.
    'bottomUiSettings', 'stageTrackPill', 'hidePlayerRightPanelButton', 'alwaysShowTrackSwitchButtons',
    // AVPlayer currently has no Web Audio transition, gain or fade engine.
    'transitionSettings', 'audioOutputSettings', 'cacheAnalysis', 'reduceMotionTransitionOverlay',
    // Desktop broadcasting/capture and renderer workarounds.
    'streaming', 'enablePlayerPageNativeBlur', 'glowBlurQuantize',
]);

export const isIOSSettingAvailable = (id: string): boolean => !isNativeIOS() || !UNAVAILABLE.has(id);
