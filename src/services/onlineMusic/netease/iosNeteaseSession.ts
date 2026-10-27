import { readProviderSessionValue, writeProviderSessionValue } from '../providerStorage';

// Keep one installation/session identity across QR key polling and foreground requests.
const SESSION_KEY = 'ios_transport_cookies';
const INSTALLATION_KEY = 'ios_installation_id';
const AUTH_COOKIES = new Set(['MUSIC_U', 'MUSIC_R_T']);

export function parseIOSNeteaseCookies(value: string): Record<string, string> {
    const entries: [string, string][] = [];
    for (const part of value.split(';')) {
        const index = part.indexOf('=');
        const key = part.slice(0, index).trim();
        const content = part.slice(index + 1).trim();
        if (index > 0 && /^[A-Za-z0-9_]+$/.test(key) && !/[\r\n]/.test(content)) entries.push([key, content]);
    }
    return Object.fromEntries(entries);
}

export function iosNeteaseCookies(accountCookie = ''): string {
    let installation = readProviderSessionValue('netease', INSTALLATION_KEY);
    if (!installation) {
        installation = Array.from(crypto.getRandomValues(new Uint8Array(26)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
        writeProviderSessionValue('netease', INSTALLATION_KEY, installation);
    }
    const saved = parseIOSNeteaseCookies(readProviderSessionValue('netease', SESSION_KEY) ?? '');
    // Account credentials have one owner (the existing account store), never a second hidden copy.
    for (const key of AUTH_COOKIES) delete saved[key];
    return Object.entries({ deviceId: installation, sDeviceId: installation, ...saved, ...parseIOSNeteaseCookies(accountCookie) })
        .map(([key, value]) => `${key}=${value}`).join('; ');
}

export function keepIOSNeteaseCookies(cookies: string[]) {
    const saved = parseIOSNeteaseCookies(readProviderSessionValue('netease', SESSION_KEY) ?? '');
    Object.assign(saved, parseIOSNeteaseCookies(cookies.join(';')));
    for (const key of AUTH_COOKIES) delete saved[key];
    writeProviderSessionValue('netease', SESSION_KEY, Object.entries(saved).map(([key, value]) => `${key}=${value}`).join('; '));
}
