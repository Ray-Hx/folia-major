import { isNativeIOS } from '../../services/ios/native';

// Preserve the original hex layout while fitting an entire card into a short iPhone landscape canvas.
export function fitIOSGridBox<T extends { cardHeight: number }>(box: T, height: number): T {
    if (!isNativeIOS()) return box;
    if (height < 450) return { ...box, cardWidth: 320, cardHeight: 160, spacingX: 350, spacingY: 190 };
    const scale = Math.min(1, Math.max(180, height - 96) / box.cardHeight);
    return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, typeof value === 'number' ? value * scale : value])) as T;
}
