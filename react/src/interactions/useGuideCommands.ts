/**
 * Purpose: React hook that owns the GuideCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import { createDocumentId } from '../lib/ids';
import type { Guide, GuideDraft, GuidePlacement } from '../lib/guides';

interface UseGuideCommandsOptions {
    pushHistory(): void;
    setGuides: Dispatch<SetStateAction<Guide[]>>;
    setGuidePlacement: Dispatch<SetStateAction<'edge' | null>>;
    setGuideDraft: Dispatch<SetStateAction<GuideDraft | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Canvas guide placement and deletion commands. */
export function useGuideCommands(options: UseGuideCommandsOptions) {
    const startGuidePlacement = () => {
        options.setGuideDraft(null);
        options.setGuidePlacement('edge');
        options.setStatus(
            'Hover an edge or axis, click it, then move to set the parallel offset.',
        );
    };

    const placeGuide = (placement: GuidePlacement) => {
        options.pushHistory();
        options.setGuides((current) => [
            ...current,
            { id: createDocumentId('guide'), ...placement },
        ]);
        options.setGuideDraft(null);
        options.setStatus('Parallel guide added.');
    };

    const handleDeleteGuide = (id: string) => {
        options.pushHistory();
        options.setGuides((current) =>
            current.filter((guide) => guide.id !== id),
        );
        options.setStatus('Guide deleted.');
    };

    return { startGuidePlacement, placeGuide, handleDeleteGuide };
}
