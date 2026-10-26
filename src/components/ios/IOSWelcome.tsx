import React from 'react';
import { Headphones, FolderOpen, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// A first-run introduction describes the capabilities of this iPhone build.
export function IOSWelcome() {
    const { t } = useTranslation();
    return <div className="space-y-6 py-2">
        <div className="space-y-2">
            <p className="text-2xl font-semibold">Folia <span className="opacity-50">for iPhone</span></p>
            <p className="text-sm leading-relaxed opacity-70">{t('ios.welcome')}</p>
        </div>
        {([
            [FolderOpen, 'ios.filesTitle', 'ios.filesBody'],
            [Headphones, 'ios.playbackTitle', 'ios.playbackBody'],
            [Sparkles, 'ios.lyricsTitle', 'ios.lyricsBody'],
        ] as const).map(([Icon, title, body]) => <div key={title} className="flex gap-4 rounded-xl bg-white/5 p-4">
            <Icon className="mt-1 shrink-0" size={22} />
            <div className="min-w-0 space-y-1"><p className="font-semibold">{t(title)}</p><p className="text-sm leading-relaxed opacity-65">{t(body)}</p></div>
        </div>)}
    </div>;
}
