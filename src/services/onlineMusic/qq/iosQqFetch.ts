import { CapacitorHttp } from '@capacitor/core';

// Upstream QQ's serverless HTTP clients use this native transport to retain redirects and cookies.
export async function iosQqFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const request = new Request(input, init);
    if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => { headers[name] = value; });
    // WebKit's Request guard strips Cookie; native HTTP must receive the caller's original headers.
    if (init.headers) new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
    const answer = await CapacitorHttp.request({
        url: request.url,
        method: request.method,
        headers,
        data: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
        disableRedirects: request.redirect === 'manual',
        responseType: 'arraybuffer',
        connectTimeout: 10000,
        readTimeout: 15000,
    });
    if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const raw = answer.data;
    const contentType = String(answer.headers['content-type'] ?? '').toLowerCase();
    const bytes = contentType.includes('application/json')
        ? new TextEncoder().encode(typeof raw === 'string' ? raw : JSON.stringify(raw))
        : Uint8Array.from(atob(String(raw ?? '')), character => character.charCodeAt(0));
    const responseHeaders = new Headers();
    Object.entries(answer.headers).forEach(([name, value]) => responseHeaders.set(name, String(value)));
    const setCookies = (responseHeaders.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=)/).map(value => value.trim()).filter(Boolean);
    // Foundation may merge several Set-Cookie fields into one; the QQ exchange needs each one.
    Object.defineProperty(responseHeaders, 'getSetCookie', { value: () => setCookies });
    const response = new Response(answer.status === 204 || answer.status === 304 ? null : bytes, {
        status: answer.status,
        headers: responseHeaders,
    });
    // WebKit filters Set-Cookie when constructing a Response; the native response headers are
    // needed by the upstream login client's cookie jar, including on manual redirect hops.
    Object.defineProperty(response, 'headers', { value: responseHeaders });
    return response;
}
