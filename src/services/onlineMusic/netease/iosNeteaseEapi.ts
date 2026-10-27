import CryptoJS from 'crypto-js';
import { parseIOSNeteaseCookies } from './iosNeteaseSession';

// The pinned desktop API's EAPI envelope for its QR key and confirmation requests.
// Its worker makes a fresh device identity when it starts and retains it for each QR round.
let deviceId: string | undefined;
let nmtid: string | undefined;
const loginDeviceId = () => (deviceId ??= Array.from(crypto.getRandomValues(new Uint8Array(26)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase());

export function keepIOSNeteaseLoginCookies(cookies: string[]) {
    const received = parseIOSNeteaseCookies(cookies.join(';'));
    if ('NMTID' in received) nmtid = received.NMTID || undefined;
}
export function makeIOSNeteaseLoginRequest(uri: string, payload: Record<string, unknown>, cookie: string, now = Date.now()) {
    const saved = parseIOSNeteaseCookies(cookie);
    const header: Record<string, string> = {
        osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
        deviceId: loginDeviceId(),
        os: 'pc',
        appver: '3.1.17.204416',
        versioncode: saved.versioncode || '140',
        mobilename: saved.mobilename || '',
        buildver: saved.buildver || String(now).slice(0, 10),
        resolution: saved.resolution || '1920x1080',
        __csrf: saved.__csrf || '',
        channel: 'netease',
        requestId: `${now}_${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
    };
    for (const name of ['MUSIC_U', 'MUSIC_A']) {
        if (saved[name]) header[name] = saved[name];
    }
    if (nmtid) header.NMTID = nmtid;
    const json = JSON.stringify({ ...payload, e_r: false, header });
    const digest = CryptoJS.MD5(`nobody${uri}use${json}md5forencrypt`).toString();
    const plain = `${uri}-36cd479b6b5-${json}-36cd479b6b5-${digest}`;
    const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plain), CryptoJS.enc.Utf8.parse('e82ckenh8dichen8'), {
        mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString().toUpperCase();
    return {
        url: `https://interfacepc.music.163.com/eapi/${uri.slice('/api/'.length)}`,
        cookie: Object.entries(header).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('; '),
        data: new URLSearchParams({ params: encrypted }).toString(),
    };
}
