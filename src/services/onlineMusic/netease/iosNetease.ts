import { CapacitorHttp } from '@capacitor/core';
import QRCode from 'qrcode';
import modules from 'virtual:ios-netease-routes';
import { readProviderSessionValue } from '../providerStorage';
import { iosNeteaseCookies, keepIOSNeteaseCookies } from './iosNeteaseSession';
import { keepIOSNeteaseLoginCookies, makeIOSNeteaseLoginRequest } from './iosNeteaseEapi';

// Native iOS calls NetEase directly; pure payload/response modules come from the pinned upstream API.
type Answer = { status: number; body: Record<string, any>; cookie: string[] };
type Request = (uri: string, data: Record<string, unknown>, options?: { cookie?: unknown }) => Promise<Answer>;
type Route = (query: Record<string, any>, request: Request) => Promise<Answer>;

export async function requestIOSNetease(endpoint: string, options: RequestInit = {}) {
    const url = new URL(endpoint, 'https://music.163.com');
    const query: Record<string, any> = Object.fromEntries(url.searchParams);
    if (typeof options.body === 'string') Object.assign(query, Object.fromEntries(new URLSearchParams(options.body)));
    query.cookie ??= readProviderSessionValue('netease', 'cookie', ['netease_cookie']) ?? '';
    const request: Request = async (uri, payload, settings = {}) => {
        if (!uri.startsWith('/api/') || uri.includes('..') || uri.includes('?')) throw new Error('Invalid NetEase API route');
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const cookie = iosNeteaseCookies(typeof settings.cookie === 'string' ? settings.cookie : query.cookie);
        const csrf = /(?:^|;\s*)__csrf=([^;]+)/.exec(cookie)?.[1] ?? '';
        const loginRequest = uri === '/api/login/qrcode/unikey' || uri === '/api/login/qrcode/client/login'
            ? makeIOSNeteaseLoginRequest(uri, payload, cookie) : null;
        const body = new URLSearchParams();
        if (!loginRequest) for (const [key, value] of Object.entries({ ...payload, csrf_token: csrf, e_r: false })) {
            if (value !== undefined) body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        const response = await CapacitorHttp.post({
            url: loginRequest?.url ?? 'https://music.163.com' + uri,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/',
                'User-Agent': 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)',
                Cookie: loginRequest?.cookie ?? `${cookie}; os=ios; appver=9.0.90; __remember_me=true` },
            data: loginRequest?.data ?? body.toString(), responseType: 'json', connectTimeout: 15000, readTimeout: 20000,
        }).catch(cause => {
            throw Object.assign(new Error('NetEase could not be reached', { cause }), { networkFailure: true });
        });
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!data || typeof data !== 'object') throw new Error(`NetEase returned HTTP ${response.status} without JSON`);
        if (response.status >= 400) throw Object.assign(new Error(`NetEase returned HTTP ${response.status}`), { httpStatus: response.status, answer: data });
        const setCookie = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'set-cookie')?.[1] ?? '';
        const cookies = String(setCookie).split(/,(?=\s*[^;,=\s]+=[^;,]*)/).map(value => value.trim().split(';')[0]).filter(Boolean);
        keepIOSNeteaseCookies(cookies);
        if (loginRequest) keepIOSNeteaseLoginCookies(cookies);
        return { status: 200, body: data, cookie: cookies };
    };
    if (url.pathname === '/login/qr/create') {
        // Same QR URL as the desktop backend: the upstream route is called without `platform`,
        // so it returns the PC login URL without the separate web chainId.
        const qrurl = `https://music.163.com/login?codekey=${encodeURIComponent(String(query.key))}`;
        return { code: 200, data: { qrurl, qrimg: await QRCode.toDataURL(qrurl, { margin: 1, width: 256 }) } };
    }
    // Avoid the upstream QR check wrapper, which swallows refused requests and loses diagnostics.
    if (url.pathname === '/login/qr/check') {
        const result = await request('/api/login/qrcode/client/login', { key: query.key, type: 3 });
        return { ...result.body, cookie: result.cookie.join(';') };
    }
    if (url.pathname === '/song/url/v1') {
        return (await request('/api/song/enhance/player/url/v1', {
            ids: `[${query.id}]`, level: query.level || 'standard', encodeType: 'flac',
        })).body;
    }
    const name = url.pathname.slice(1).replaceAll('/', '_');
    const route = (modules as Record<string, Route>)[name];
    if (typeof route !== 'function') throw new Error(`This NetEase operation is not available on iOS: ${url.pathname}`);
    return (await route(query, request)).body;
}
