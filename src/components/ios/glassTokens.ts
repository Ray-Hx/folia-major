import type { CSSProperties } from 'react';
import { isNativeIOS } from '../../services/ios/native';

// Keep controls clearest and settings one translucent layer denser; desktop tokens stay unchanged.
export function iosGlassTokens(light: boolean, surface: 'controls' | 'settings'): CSSProperties {
    if (!isNativeIOS()) return {};
    const color = light ? '248, 248, 250' : '22, 22, 27';
    return {
        '--pn-glass': `rgba(${color}, 0.12)`,
        '--st-win': `rgba(${color}, ${surface === 'settings' ? 0.22 : 0.12})`,
        '--st-side': `rgba(${color}, 0.1)`,
        '--st-card': light ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.045)',
        '--st-pv': `rgba(${color}, 0.08)`,
        '--st-raise': light ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.14)',
    } as CSSProperties;
}
