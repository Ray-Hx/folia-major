import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacitorHttp } from '@capacitor/core';
import { requestIOSNetease } from '../../../src/services/onlineMusic/netease/iosNetease';

const sessions = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { post: vi.fn() } }));
vi.mock('../../../src/services/onlineMusic/providerStorage', () => ({
    readProviderSessionValue: (_provider: string, key: string) => sessions.get(key) ?? '',
    writeProviderSessionValue: (_provider: string, key: string, value: string) => sessions.set(key, value),
}));

// Login responses must retain the existing provider contract and never need a third-party relay.
const post = vi.mocked(CapacitorHttp.post);
describe('iOS direct NetEase transport', () => {
    beforeEach(() => { post.mockReset(); sessions.clear(); });
    it('uses the upstream QR key request and produces a local QR image', async () => {
        post.mockResolvedValue({status:200, headers:{}, data:{code:200, unikey:'fixture-key'}, url:''});
        expect(await requestIOSNetease('/login/qr/key')).toEqual({code:200, data:{code:200, unikey:'fixture-key'}});
        expect(post.mock.calls[0][0].url).toBe('https://music.163.com/api/login/qrcode/unikey');
        const result = await requestIOSNetease('/login/qr/create?key=fixture-key') as any;
        expect(result.data.qrurl).toContain('codekey=fixture-key');
        expect(new URL(result.data.qrurl).searchParams.get('chainId')).toMatch(/^v1_[A-F0-9]{52}_web_login_\d+$/);
        expect(result.data.qrimg).toMatch(/^data:image\/png;base64,/);
        expect(post).toHaveBeenCalledTimes(1);
    });
    it('uses the same session cookie from key generation through QR creation and polling', async () => {
        post.mockResolvedValueOnce({status:200, headers:{'Set-Cookie':'sDeviceId=server-session; Path=/, NMTID=session-nonce; Path=/'}, data:{code:200, unikey:'key'}, url:''});
        await requestIOSNetease('/login/qr/key');
        const qr = await requestIOSNetease('/login/qr/create?key=key') as any;
        expect(new URL(qr.data.qrurl).searchParams.get('chainId')).toMatch(/^v1_server-session_web_login_\d+$/);
        post.mockResolvedValueOnce({status:200, headers:{}, data:{code:801}, url:''});
        await requestIOSNetease('/login/qr/check?key=key');
        expect(post.mock.calls[1][0].headers?.Cookie).toContain('sDeviceId=server-session');
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
    it('rejects a non-JSON HTTP failure and unsupported routes explicitly', async () => {
        post.mockResolvedValue({status:502, headers:{}, data:{code:502}, url:''});
        await expect(requestIOSNetease('/login/qr/key')).rejects.toThrow('HTTP 502');
        await expect(requestIOSNetease('/unsupported/operation')).rejects.toThrow('not available on iOS');
    });
});
