import { useEffect, useState, type RefObject } from 'react';
/** Match SVG coordinates to its rendered surface so point picking has no letterbox offset. */
export function useProfileViewport(element: RefObject<SVGSVGElement | null>) {
    const [size, setSize] = useState({ width: 360, height: 240 });
    useEffect(() => {
        const svg = element.current;
        if (!svg) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect || rect.width <= 0 || rect.height <= 0) return;
            setSize((previous) =>
                previous.width === rect.width && previous.height === rect.height
                    ? previous
                    : { width: rect.width, height: rect.height },
            );
        });
        observer.observe(svg);
        return () => observer.disconnect();
    }, [element]);
    return size;
}
