import { createStrokeText, FONT_OPTIONS } from '../engine/cad-font.js';
import { ImagePicker } from '../tools/ImagePicker';

const strokeSample = createStrokeText(
    'Single Line Engraving',
    { x: 0, y: 0 },
    6,
);
const strokePath = strokeSample
    .map((stroke: { x: number; y: number }[]) =>
        stroke
            .map(
                (point, index) =>
                    `${index ? 'L' : 'M'}${point.x},${6 - point.y}`,
            )
            .join(' '),
    )
    .join(' ');

export function FontPicker({
    value,
    onChange,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    className: string;
}) {
    return (
        <ImagePicker
            ariaLabel="Text font"
            value={value}
            onChange={onChange}
            className={`w-full ${className}`}
            placeholder="Choose font"
            groups={[
                {
                    options: FONT_OPTIONS.map((font) => ({
                        id: font.id,
                        label: font.name,
                    })),
                },
            ]}
            renderLabel={(option) => {
                const font = FONT_OPTIONS.find((font) => font.id === option.id);
                return font?.kind === 'stroke' ? (
                    <span>
                        <span className="sr-only">{option.label}</span>
                        <svg
                            aria-hidden="true"
                            viewBox="-1 -1 107 8"
                            className="h-5 max-w-full w-60"
                        >
                            <path
                                d={strokePath}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="0.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>
                ) : (
                    <span
                        style={{
                            fontFamily: `"${font?.family}", sans-serif`,
                            fontSize: 18,
                        }}
                    >
                        {option.label}
                    </span>
                );
            }}
        />
    );
}
