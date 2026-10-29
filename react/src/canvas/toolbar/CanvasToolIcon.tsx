import type { ReactNode } from 'react';

type CanvasIcon =
    | 'line'
    | 'rectangle'
    | 'rounded-rectangle'
    | 'ellipse'
    | 'slot'
    | 'arc'
    | 'polyline'
    | 'clock'
    | 'mandala'
    | 'fillet'
    | 'chamfer'
    | 'dogbone'
    | 'offset'
    | 'boolean';

const artwork: Record<CanvasIcon, ReactNode> = {
    chamfer: (
        <>
            <path d="M4 20v-8l8-8h8" />
            <path d="M4 8V4h4" strokeDasharray="2 2" opacity="0.45" />
        </>
    ),
    fillet: (
        <>
            <path d="M4 20v-8a8 8 0 0 1 8-8h8" />
            <path d="M4 8V4h4" strokeDasharray="2 2" opacity="0.45" />
        </>
    ),
    dogbone: <path d="M4 4h16v7h-4a3 3 0 1 1-3 3v6H4Z" />,
    offset: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect
                x="7"
                y="7"
                width="10"
                height="10"
                rx="1"
                strokeDasharray="2 2"
            />
        </>
    ),
    boolean: (
        <>
            <path d="M3 3h11v6h7v12H9v-7H3Z" />
            <path d="M9 14V9h5" strokeDasharray="2 2" />
        </>
    ),

    line: (
        <>
            <path d="M5 19 19 5" />
            <circle cx="5" cy="19" r="1.5" />
            <circle cx="19" cy="5" r="1.5" />
        </>
    ),
    rectangle: <rect x="4" y="4" width="16" height="16" />,
    'rounded-rectangle': <rect x="4" y="4" width="16" height="16" rx="5" />,
    ellipse: <ellipse cx="12" cy="12" rx="9" ry="6" />,
    slot: (
        <>
            <rect x="3" y="7" width="18" height="10" rx="5" />
            <path d="M8 12h8" strokeDasharray="2 3" />
        </>
    ),
    arc: (
        <>
            <path d="M4 18a8 11 0 0 1 16 0" />
            <circle cx="4" cy="18" r="1.5" />
            <circle cx="20" cy="18" r="1.5" />
        </>
    ),
    polyline: (
        <>
            <path d="m3 17 5-10 7 8 6-10" />
            <circle cx="8" cy="7" r="1" />
            <circle cx="15" cy="15" r="1" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v2m9 7h-2m-7 9v-2m-9-7h2m7-5v5l3 2" />
        </>
    ),
    mandala: (
        <>
            {[0, 60, 120, 180, 240, 300].map((angle) => (
                <path
                    key={angle}
                    d="M12 12C8 9 8 5 12 2c4 3 4 7 0 10Z"
                    transform={`rotate(${angle} 12 12)`}
                />
            ))}
            <circle cx="12" cy="12" r="2" />
        </>
    ),
};

/** Same 24-unit, round-stroke construction as the surrounding Lucide icons. */
export function CanvasToolIcon({
    tool,
    size = 18,
}: {
    tool: CanvasIcon;
    size?: number;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="shrink-0"
        >
            {artwork[tool]}
        </svg>
    );
}
