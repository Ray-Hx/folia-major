import React from 'react';
import { Disc, Loader2 } from 'lucide-react';
import { getGrid3DSliderDisplayName, getGrid3DSliderSecondaryText, type Grid3DSliderItem } from '../../library/suites/grid/home/Grid3DSlider';
import { getSizedCoverUrl } from '../../utils/coverUrl';

// A touch-first collection overview reuses the existing catalogue cards and selection actions.
export function IOSCollectionGrid({ items, onSelect, isLoading, emptyMessage, isInteractive, isDaylight }: {
    items: Grid3DSliderItem[]; onSelect: (item: Grid3DSliderItem, index: number) => void;
    isLoading: boolean; emptyMessage?: string; isInteractive: boolean; isDaylight: boolean;
}) {
    if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!items.length) return <div className="flex flex-1 items-center justify-center p-6 text-sm opacity-60">{emptyMessage}</div>;
    return <div className="ios-collection-grid min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-2">
        <div className="grid grid-cols-2 gap-3 min-[650px]:grid-cols-4">
            {items.map((item, index) => <button key={item.id} disabled={!isInteractive}
                onClick={() => onSelect(item, index)}
                className={`min-w-0 overflow-hidden rounded-2xl border p-3 text-left backdrop-blur-xl ${isDaylight ? 'border-black/5 bg-white/60' : 'border-white/10 bg-black/25'}`}>
                <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-black/15">
                    {item.coverUrl ? <img src={getSizedCoverUrl(item.coverUrl, 320)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Disc size={48} className="opacity-40" />}
                </div>
                <p className="truncate text-sm font-semibold">{getGrid3DSliderDisplayName(item)}</p>
                <p className="mt-1 truncate text-xs opacity-55">{getGrid3DSliderSecondaryText(item)}</p>
            </button>)}
        </div>
    </div>;
}
