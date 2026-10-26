import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { isNativeIOS } from '../../services/ios/native';
import { attachNativeAudio } from '../../services/ios/audioElementAdapter';

// Keep desktop/Web playback untouched; iOS registers a native-backed transport element.
export const PlatformAudio = React.forwardRef<HTMLAudioElement, React.AudioHTMLAttributes<HTMLAudioElement>>(
    function PlatformAudio({ src, ...props }, ref) {
        const source = useRef(src);
        source.current = src;
        const adapter = useRef<ReturnType<typeof attachNativeAudio> | null>(null);
        const register = useCallback((element: HTMLAudioElement | null) => {
            adapter.current?.dispose();
            adapter.current = element && isNativeIOS() ? attachNativeAudio(element, () => source.current) : null;
            if (typeof ref === 'function') ref(element);
            else if (ref) ref.current = element;
        }, [ref]);
        useLayoutEffect(() => {
            if (src) void adapter.current?.load().catch(error => console.error('[iOSAudio] Load failed', error));
        }, [src]);
        return <audio {...props} src={isNativeIOS() ? undefined : src} ref={register} />;
    },
);
