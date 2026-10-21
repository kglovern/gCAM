import { useEffect } from 'react';

/** Keep actions above software keyboards on browsers that only resize the visual viewport. */
export function useVisualViewportHeight() {
    useEffect(() => {
        const viewport = window.top === window ? window.visualViewport : null;
        const update = () =>
            document.documentElement.style.setProperty(
                '--app-height',
                `${viewport && viewport.scale === 1 ? Math.min(viewport.height, window.innerHeight) : window.innerHeight}px`,
            );
        update();
        viewport?.addEventListener('resize', update);
        window.addEventListener('resize', update);
        return () => {
            viewport?.removeEventListener('resize', update);
            window.removeEventListener('resize', update);
            document.documentElement.style.removeProperty('--app-height');
        };
    }, []);
}
