import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacitorHttp } from '@capacitor/core';
import CryptoJS from 'crypto-js';
import { createRequire } from 'node:module';
import { requestIOSNetease } from '../../../src/services/onlineMusic/netease/iosNetease';
import { describeNeteaseLoginFailure } from '../../../src/services/onlineMusic/netease/neteaseLoginFailure';

const sessions = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', async importOriginal => ({ ...await importOriginal<typeof import('@capacitor/core')>(), CapacitorHttp: { post: vi.fn() } }));
vi.mock('../../../src/services/onlineMusic/providerStorage', () => ({
    readProviderSessionValue: (_provider: string, key: string) => sessions.get(key) ?? '',
    writeProviderSessionValue: (_provider: string, key: string, value: string) => sessions.set(key, value),
}));

// Login responses must retain the existing provider contract and never need a third-party relay.
const post = vi.mocked(CapacitorHttp.post);
describe('iOS direct NetEase transport', () => {
    beforeEach(() => { post.mockReset(); sessions.clear(); });
    it('uses the upstream QR key request and the desktop PC QR URL', async () => {
        post.mockResolvedValue({status:200, headers:{}, data:{code:200, unikey:'fixture-key'}, url:''});
        expect(await requestIOSNetease('/login/qr/key')).toEqual({code:200, data:{code:200, unikey:'fixture-key'}});
        const first = post.mock.calls[0][0];
        expect(first.url).toBe('https://interfacepc.music.163.com/eapi/login/qrcode/unikey');
        const encrypted = new URLSearchParams(first.data as string).get('params')!;
        const key = CryptoJS.enc.Utf8.parse('e82ckenh8dichen8');
        const decrypted = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Hex.parse(encrypted) } as CryptoJS.lib.CipherParams, key, {
            mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7,
        }).toString(CryptoJS.enc.Utf8);
        const [uri, json] = decrypted.split('-36cd479b6b5-');
        const payload = JSON.parse(json);
        expect(uri).toBe('/api/login/qrcode/unikey');
        expect(payload).toMatchObject({ type: 3, e_r: false, header: { os: 'pc', appver: '3.1.17.204416', channel: 'netease' } });
        // Compare the actual encrypted body with the pinned upstream implementation.
        const upstream = createRequire(import.meta.url)('@neteasecloudmusicapienhanced/api/util/crypto');
        expect(encrypted).toBe(upstream.eapi(uri, payload).params);
        const result = await requestIOSNetease('/login/qr/create?key=fixture-key') as any;
        // The desktop backend reaches the upstream route without `platform`, which returns the PC
        // URL. A web chainId would put the scan on NetEase's blocked web login page.
        expect(result.data.qrurl).toBe('https://music.163.com/login?codekey=fixture-key');
        expect(new URL(result.data.qrurl).searchParams.has('chainId')).toBe(false);
        expect(result.data.qrimg).toMatch(/^data:image\/png;base64,/);
        expect(post).toHaveBeenCalledTimes(1);
    });
    it('keeps the server session through key generation and polling', async () => {
        post.mockResolvedValueOnce({status:200, headers:{'Set-Cookie':'sDeviceId=server-session; Path=/, NMTID=session-nonce; Path=/'}, data:{code:200, unikey:'key'}, url:''});
        await requestIOSNetease('/login/qr/key');
        const qr = await requestIOSNetease('/login/qr/create?key=key') as any;
        expect(qr.data.qrurl).toBe('https://music.163.com/login?codekey=key');
        post.mockResolvedValueOnce({status:200, headers:{}, data:{code:801}, url:''});
        await requestIOSNetease('/login/qr/check?key=key');
        const firstDevice = /deviceId=([^;]+)/.exec(String(post.mock.calls[0][0].headers?.Cookie))?.[1];
        expect(firstDevice).toBeTruthy();
        expect(post.mock.calls[1][0].headers?.Cookie).toContain(`deviceId=${firstDevice}`);
        expect(post.mock.calls[1][0].headers?.Cookie).toContain('NMTID=session-nonce');
    });
    it('does not preserve a second authenticated account after sign-out', async () => {
        post.mockResolvedValue({status:200, headers:{'Set-Cookie':'MUSIC_U=test-token; Path=/, NMTID=nonce; Path=/'}, data:{code:803}, url:''});
        await requestIOSNetease('/login/qr/check?key=key');
        expect(sessions.get('ios_transport_cookies')).not.toContain('MUSIC_U');
        post.mockResolvedValue({status:200, headers:{}, data:{code:801}, url:''});
        await requestIOSNetease('/login/qr/key');
        expect(post.mock.calls[1][0].headers?.Cookie).not.toContain('test-token');
    });
    it('keeps login cookies together without treating expiry commas as cookie boundaries', async () => {
        post.mockResolvedValue({status:200, url:'', headers:{'Set-Cookie':'MUSIC_U=test-token; Expires=Tue, 03 Nov 2026 00:00:00 GMT; Path=/, __csrf=test-csrf; Path=/'}, data:{code:803}});
        expect(await requestIOSNetease('/login/qr/check?key=fixture')).toMatchObject({code:803, cookie:'MUSIC_U=test-token;__csrf=test-csrf'});
    });
    it('preserves the waiting state instead of reporting a failed login', async () => {
        post.mockResolvedValue({status:200, headers:{}, data:{code:801, message:'waiting'}, url:''});
        expect(await requestIOSNetease('/login/qr/check?key=fixture')).toMatchObject({code:801});
    });
    it('resolves a playlist through its detail and song-detail requests', async () => {
        post.mockResolvedValueOnce({status:200, headers:{}, url:'', data:{code:200, playlist:{trackIds:[{id:1},{id:2}]}}});
        post.mockResolvedValueOnce({status:200, headers:{}, url:'', data:{code:200, songs:[{id:2}]}});
        expect(await requestIOSNetease('/playlist/track/all?id=12&offset=1&limit=1')).toMatchObject({songs:[{id:2}]});
        expect(new URLSearchParams(post.mock.calls[1][0].data as string).get('c')).toBe('[{"id":2}]');
    });
    it('preserves a refused QR request code and message for diagnostics', async () => {
        post.mockResolvedValue({status:403, headers:{}, data:{code:8821, message:'request denied'}, url:''});
        try {
            await requestIOSNetease('/login/qr/check?key=fixture');
            throw new Error('Expected request to fail');
        } catch (error) {
            expect(describeNeteaseLoginFailure('check', error)).toMatchObject({httpStatus:403, code:'8821', message:'request denied'});
        }
    });
    it('rejects a non-JSON HTTP failure and unsupported routes explicitly', async () => {
        post.mockResolvedValue({status:502, headers:{}, data:{code:502}, url:''});
        await expect(requestIOSNetease('/login/qr/key')).rejects.toThrow('HTTP 502');
        await expect(requestIOSNetease('/unsupported/operation')).rejects.toThrow('not available on iOS');
    });
});
