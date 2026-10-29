import { useState } from 'react';
import {
    BLOCK_LABELS,
    CONTROLLERS,
    controllerPreset,
    outputError,
    type BlockId,
    type ControllerId,
    type OutputSettings,
} from './profiles';
import { renderProgram } from './renderProgram';

const field =
    'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white';
const sample =
    '(Example job)\nG21\nG90\nG17\n(Pocket)\nG0 Z5\nT1 M6\nM3 S12000\nG1 X10 Y10 F600\nG0 Z5\nM5\n(Finish)\nT2 M6\nM3 S10000\nG1 X20 Y10 F400\nG0 Z5\nM5\nM30';

export function GcodeSettings({
    value,
    onChange,
    emitArcs,
    onEmitArcsChange,
}: {
    value: OutputSettings;
    onChange: (value: OutputSettings) => void;
    emitArcs: boolean;
    onEmitArcsChange: (value: boolean) => void;
}) {
    const [previewMode, setPreviewMode] = useState<'mill' | 'laser' | 'rotary'>(
        'mill',
    );
    const update = (patch: Partial<OutputSettings>) =>
        onChange({ ...value, ...patch });
    const preset = controllerPreset(value.controller);
    let preview = '';
    let error = '';
    try {
        preview = renderProgram(
            previewMode === 'laser'
                ? sample
                      .replace(/T\d M6\n/g, '')
                      .replace(/M3 S\d+/g, 'M4 S0')
                      .replace(/G1 X/g, 'G1 S500 X')
                : previewMode === 'rotary'
                  ? 'G21\nG90\nG17\nG94\nG0 Z20\nM3 S12000\nG93\nG1 X10 A90 F4\nG94\nG0 Z20\nM5\nM2'
                  : sample,
            value,
            'metric',
            {
                laser: previewMode === 'laser',
                rotary: previewMode === 'rotary',
                fileName: 'Example job',
                operations: [1, 2].map((toolNumber) => ({
                    marker: toolNumber === 1 ? '(Pocket)' : '(Finish)',
                    name: toolNumber === 1 ? 'Pocket' : 'Finish',
                    values: {
                        toolNumber,
                        toolName: `Example tool ${toolNumber}`,
                        toolDiameter: 3,
                        feedRate: toolNumber === 1 ? 600 : 400,
                        plungeRate: 100,
                        safeZ: 5,
                        spindleSpeed: toolNumber === 1 ? 12000 : 10000,
                    },
                })),
            },
        );
    } catch (cause) {
        error = outputError(cause);
    }
    return (
        <section aria-label="G-code output" className="space-y-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                G-code output
            </h3>
            <div className="space-y-4 rounded-lg border border-slate-300 bg-white p-4 dark:border-robin-900 dark:bg-slate-800/80">
                <label className="block text-sm">
                    Controller preset
                    <select
                        className={field}
                        value={value.controller}
                        onChange={(event) => {
                            const next = controllerPreset(
                                event.target.value as ControllerId,
                            );
                            onChange(next);
                            onEmitArcsChange(next.arcs);
                        }}
                    >
                        {CONTROLLERS.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <details className="space-y-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Customise output
                    </summary>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {
                            CONTROLLERS.find(
                                (item) => item.id === value.controller,
                            )?.note
                        }
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={emitArcs && value.arcs}
                            onChange={(event) => {
                                update({ arcs: event.target.checked });
                                onEmitArcsChange(event.target.checked);
                            }}
                        />
                        Emit G2/G3 arcs (including helical entry)
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                            Dwell format
                            <select
                                className={field}
                                value={value.dwell}
                                onChange={(event) =>
                                    update({
                                        dwell: event.target
                                            .value as OutputSettings['dwell'],
                                    })
                                }
                            >
                                <option value="P-seconds">P — seconds</option>
                                <option value="P-milliseconds">
                                    P — milliseconds
                                </option>
                                <option value="S-seconds">S — seconds</option>
                            </select>
                        </label>
                        <label className="text-sm">
                            Spindle delay (seconds)
                            <input
                                className={field}
                                type="number"
                                min={0}
                                max={3600}
                                step={0.1}
                                value={value.delaySeconds}
                                onChange={(event) =>
                                    update({
                                        delaySeconds:
                                            event.target.valueAsNumber,
                                    })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            Comments
                            <select
                                className={field}
                                value={value.comments}
                                onChange={(event) =>
                                    update({
                                        comments: event.target
                                            .value as OutputSettings['comments'],
                                    })
                                }
                            >
                                <option value="parentheses">(Comment)</option>
                                <option value="semicolon">; Comment</option>
                                <option value="none">Off</option>
                            </select>
                        </label>
                        <label className="text-sm">
                            Decimal places
                            <input
                                className={field}
                                type="number"
                                min={3}
                                max={6}
                                value={value.decimals}
                                onChange={(event) =>
                                    update({
                                        decimals: event.target.valueAsNumber,
                                    })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            File extension
                            <input
                                className={field}
                                value={value.extension}
                                maxLength={10}
                                onChange={(event) =>
                                    update({ extension: event.target.value })
                                }
                            />
                        </label>
                        <label className="text-sm">
                            Line endings
                            <select
                                className={field}
                                value={value.lineEnding}
                                onChange={(event) =>
                                    update({
                                        lineEnding: event.target
                                            .value as OutputSettings['lineEnding'],
                                    })
                                }
                            >
                                <option value="source">
                                    Keep exporter default
                                </option>
                                <option>LF</option>
                                <option>CRLF</option>
                            </select>
                        </label>
                        <label className="text-sm">
                            Laser full-power value
                            <input
                                className={field}
                                type="number"
                                min={1}
                                max={1000000}
                                value={value.laserMax}
                                onChange={(event) =>
                                    update({
                                        laserMax: event.target.valueAsNumber,
                                    })
                                }
                            />
                        </label>
                        {value.controller === 'duet' && (
                            <label className="text-sm">
                                Spindle slot
                                <input
                                    className={field}
                                    type="number"
                                    min={0}
                                    max={255}
                                    value={value.spindleSlot}
                                    onChange={(event) =>
                                        update({
                                            spindleSlot:
                                                event.target.valueAsNumber,
                                        })
                                    }
                                />
                            </label>
                        )}
                    </div>
                    {['grblhal', 'grbl', 'duet', 'marlin'].includes(
                        value.controller,
                    ) && (
                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={value.laserConfirmed}
                                onChange={(event) =>
                                    update({
                                        laserConfirmed: event.target.checked,
                                    })
                                }
                            />
                            Laser mode and full-power value match my firmware
                            configuration
                        </label>
                    )}
                    <details>
                        <summary className="cursor-pointer text-sm font-medium">
                            Command blocks
                        </summary>
                        <p className="my-3 text-xs text-slate-500 dark:text-slate-400">
                            Export values:{' '}
                            {
                                '{jobName}, {operationName}, {toolNumber}, {toolName}, {toolDiameter}, {feedRate}, {plungeRate}, {safeZ}, {spindleSpeed}, {spindleSlot}, {delay}, {delaySeconds}, {laserMax}, {programEnd}'
                            }
                            . Write block distances in mm and feeds in mm/min;
                            export converts them to the application units.
                            Rotary output stays in millimetres. Empty blocks
                            emit nothing. Tool-change procedures stay in the
                            host or firmware.
                        </p>
                        <div className="space-y-3">
                            {(
                                Object.entries(BLOCK_LABELS) as [
                                    BlockId,
                                    string,
                                ][]
                            ).map(([id, label]) => (
                                <div key={id}>
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor={`gcode-${id}`}
                                            className="text-sm"
                                        >
                                            {label}
                                        </label>
                                        <button
                                            type="button"
                                            className="px-2 py-1 text-xs text-robin-500"
                                            onClick={() =>
                                                update({
                                                    blocks: {
                                                        ...value.blocks,
                                                        [id]: preset.blocks[id],
                                                    },
                                                })
                                            }
                                        >
                                            Reset {label.toLowerCase()}
                                        </button>
                                    </div>
                                    <textarea
                                        id={`gcode-${id}`}
                                        className={`${field} font-mono`}
                                        rows={2}
                                        spellCheck={false}
                                        value={value.blocks[id]}
                                        onChange={(event) =>
                                            update({
                                                blocks: {
                                                    ...value.blocks,
                                                    [id]: event.target.value,
                                                },
                                            })
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </details>
                    <details open={Boolean(error)}>
                        <summary className="cursor-pointer text-sm font-medium">
                            Example output
                        </summary>
                        <label className="my-2 block text-sm">
                            Example type
                            <select
                                className={field}
                                value={previewMode}
                                onChange={(event) =>
                                    setPreviewMode(
                                        event.target
                                            .value as typeof previewMode,
                                    )
                                }
                            >
                                <option value="mill">Two-tool milling</option>
                                <option value="laser">Laser</option>
                                <option value="rotary">
                                    Rotary inverse time
                                </option>
                            </select>
                        </label>
                        {error ? (
                            <p
                                role="alert"
                                className="text-sm text-red-600 dark:text-red-400"
                            >
                                {error}
                            </p>
                        ) : (
                            <pre className="max-h-72 overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-dark">
                                {preview}
                            </pre>
                        )}
                    </details>
                </details>
            </div>
        </section>
    );
}
