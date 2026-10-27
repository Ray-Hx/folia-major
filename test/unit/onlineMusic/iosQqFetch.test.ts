import { beforeEach, describe, expect, it, vi } from 'vitest';

// The upstream login flow needs native response bytes, cookies and un-followed redirects.
const request = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }));
import { iosQqFetch } from '../../../src/services/onlineMusic/qq/iosQqFetch';

describe('iOS QQ HTTP bridge', () => {
    beforeEach(() => request.mockReset());

    it('preserves a redirect and its cookie without following it', async () => {
        request.mockResolvedValue({ status: 302, headers: { location: 'https://y.qq.com/', 'set-cookie': 'a=b; Domain=qq.com' }, data: '' });
        const response = await iosQqFetch('https://graph.qq.com/test', { redirect: 'manual', headers: { cookie: 'x=y' } });
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ disableRedirects: true, headers: { cookie: 'x=y' } }));
        expect(response.status).toBe(302);
        expect(response.headers.get('set-cookie')).toBe('a=b; Domain=qq.com');
    });

    it('preserves binary QR bytes and JSON responses', async () => {
        request.mockResolvedValueOnce({ status: 200, headers: { 'content-type': 'image/png' }, data: 'iVBORw==' });
        expect([...new Uint8Array(await (await iosQqFetch('https://qq.com/qr')).arrayBuffer())]).toEqual([137, 80, 78, 71]);
        request.mockResolvedValueOnce({ status: 200, headers: { 'content-type': 'application/json' }, data: { code: 0 } });
        expect(await (await iosQqFetch('https://qq.com/status')).json()).toEqual({ code: 0 });
    });
});
