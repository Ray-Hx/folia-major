// A native queue may advance while WebKit is suspended; adopting it must not seek or restart it.
let adoption: { url: string; playing: boolean; expires: number } | null = null;
export const beginNativeAdoption = (url: string, playing: boolean) => {
    adoption = { url, playing, expires: Date.now() + 10000 };
};
export const peekNativeAdoption = (url: string) => adoption?.url === url && adoption.expires > Date.now() ? adoption : null;
export const finishNativeAdoption = (url: string) => {
    const result = peekNativeAdoption(url);
    if (result) adoption = null;
    return result;
};
