import { describe, expect, it } from 'vitest';
import { planNativeQueue } from '../../../src/services/ios/queuePlan';

// Mixed queues stop at unavailable boundaries instead of silently changing the user's order.
const entry = (key: string, playable = true) => ({ key, url: playable ? `https://test/${key}` : null, value: key });
describe('native queue plan', () => {
    it('preserves a fully resolved queue and list repeat', () => {
        const all = [entry('a'), entry('b'), entry('c')];
        expect(planNativeQueue(all, 'b', 'all')).toEqual({ entries: all, loop: 'all' });
    });
    it('includes the current segment even when an earlier provider is unavailable', () => {
        const all = [entry('a', false), entry('b'), entry('c'), entry('d', false), entry('e')];
        expect(planNativeQueue(all, 'c', 'all')).toEqual({ entries: all.slice(1, 3), loop: 'off' });
    });
    it('allows single repeat at an unresolved boundary and does not invent current tracks', () => {
        expect(planNativeQueue([entry('a'), entry('b', false)], 'a', 'one').loop).toBe('one');
        expect(planNativeQueue([entry('a')], 'missing', 'all').entries).toEqual([]);
        expect(planNativeQueue([entry('a', false)], 'a', 'one').entries).toEqual([]);
    });
});
