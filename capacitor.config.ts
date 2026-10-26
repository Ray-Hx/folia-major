import type { CapacitorConfig } from '@capacitor/cli';

// Bundled offline UI; audio and document access belong to FoliaNative on iOS.
const config: CapacitorConfig = {
    appId: 'top.izuna.folia.ios',
    appName: 'Folia',
    webDir: 'dist',
    ios: { contentInset: 'never', backgroundColor: '#09090b', preferredContentMode: 'mobile' },
    plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
