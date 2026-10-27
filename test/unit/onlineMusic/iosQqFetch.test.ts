import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The upstream login flow needs native response bytes, cookies and un-followed redirects.
const request = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }));
import { iosQqFetch } from '../../../src/services/onlineMusic/qq/iosQqFetch';

describe('iOS QQ HTTP bridge', () => {
    beforeEach(() => request.mockReset());
    afterEach(() => vi.unstubAllGlobals());

    it('retains explicit cookies when WebKit removes them from Request headers', async () => {
        const NativeRequest = Request;
        class FilteredRequest extends NativeRequest {
            constructor(input: RequestInfo | URL, init?: RequestInit) {
                super(input, init);
                this.headers.delete('cookie');
            }
        }
        vi.stubGlobal('Request', FilteredRequest);
        request.mockResolvedValue({ status: 200, headers: {}, data: '' });
        await iosQqFetch('https://graph.qq.com/', { headers: { cookie: 'a=b' } });
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { cookie: 'a=b' } }));
    });

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

    it('completes the upstream QQ credential exchange when iOS combines Set-Cookie headers', async () => {
        const cookies = 'p_uin=123; Domain=graph.qq.com; Expires=Wed, 21 Oct 2030 07:28:00 GMT, p_skey=abc; Domain=graph.qq.com, pt_oauth_token=def; Domain=graph.qq.com';
        request.mockResolvedValueOnce({ status: 302, headers: { location: 'https://graph.qq.com/oauth2.0/login_jump', 'set-cookie': cookies }, data: '' });
        request.mockResolvedValueOnce({ status: 200, headers: {}, data: '' });
        request.mockResolvedValueOnce({ status: 302, headers: { location: 'https://y.qq.com/portal/wx_redirect.html?code=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&state=test-state' }, data: '' });
        request.mockResolvedValueOnce({ status: 200, headers: { 'content-type': 'application/json' }, data: { code: 0, req: { code: 0, data: { loginType: 2, musicid: 123, musickey: 'test-key' } } } });
        // The pinned package does not export types for this internal protocol module.
        // @ts-expect-error The ESM runtime has no declaration file at this path.
        const { exchangePtloginCredential } = await import('../../../node_modules/@yakult-green-tea/qq-music-api/dist-esm/src/services/auth/ptlogin.js');
        const credential = await exchangePtloginCredential('https://ssl.ptlogin2.graph.qq.com/check_sig', { fetch: iosQqFetch, state: 'test-state' });
        expect(credential).toMatchObject({ musicid: 123, musickey: 'test-key' });
        expect(request.mock.calls[2][0].headers.cookie).toBe('p_uin=123; p_skey=abc; pt_oauth_token=def');
    });
});
