import handleRequest from '@yakult-green-tea/qq-music-api/serverless';
import { readProviderSessionValue, writeProviderSessionValue } from '../providerStorage';

// The upstream serverless router runs locally with a stable per-installation session key.
function sessionKey(): string {
    const saved = readProviderSessionValue('qq', 'ios-session-key');
    if (saved) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    writeProviderSessionValue('qq', 'ios-session-key', key);
    return key;
}
export async function requestIOSQq(path: string, init: RequestInit): Promise<Response> {
    const secret = sessionKey();
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return handleRequest(new Request(`https://localhost${path}`, init), { QQ_SESSION_SECRET: secret });
}
