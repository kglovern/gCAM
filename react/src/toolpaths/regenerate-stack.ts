import {
    buildToolpathGcode,
    buildToolpathGcodeAsync,
    type ProfileArgs,
    type ToolpathResult,
} from '../lib/engine';
import {
    isPendingRegeneration,
    pendingRegeneration,
    toolpathDigest,
    type StackEntryLike,
} from '../lib/project';
import { previewFor } from './useToolpathStack';

/**
 * Purpose: Rebuild toolpath geometry for project entries saved compactly
 * (serializeProject `compact`) from their stored args.
 */

export interface RegenerateStackReport {
    /** Entries that could not be rebuilt; left disabled for output. */
    failed: { id: string; label: string; message: string }[];
    /** Entries whose rebuilt geometry differs from the geometry when saved. */
    changed: { id: string; label: string }[];
}

type Build = (args: ProfileArgs, useWorker: boolean) => Promise<ToolpathResult>;

/** Geometry-only builds; the stack never stores program text. */
const defaultBuild: Build = (args, useWorker) =>
    useWorker
        ? buildToolpathGcodeAsync({ ...args, geometryOnly: true })
        : buildToolpathGcode(args);

/**
 * Saved settings win over rebuilt ones, in the saved key order, so a toolpath
 * built by the sync or the worker path round-trips to the same shape. New
 * geometry arrays from a newer engine are kept.
 */
function restoreToolpath(
    saved: Record<string, unknown>,
    rebuilt: Record<string, unknown>,
): Record<string, unknown> {
    const {
        pendingRegeneration: pending,
        regenerationError: _,
        ...settings
    } = saved as Record<string, unknown> & {
        pendingRegeneration: { keys: string[] };
    };
    const toolpath: Record<string, unknown> = {};
    for (const key of pending.keys) {
        const value = key in settings ? settings[key] : rebuilt[key];
        if (value !== undefined) toolpath[key] = value;
    }
    for (const [key, value] of Object.entries(rebuilt))
        if (!(key in toolpath) && Array.isArray(value) && value.length)
            toolpath[key] = value;
    return toolpath;
}

/** A paired V-carve finish was generated alone with edge finishing; its clearing pocket is its own entry. */
function finishingArgs(args: ProfileArgs): ProfileArgs {
    if (args.operation !== 'vcarve' || !args.vCarveClearingTool) return args;
    const { vCarveClearingTool: _, ...finishing } = args;
    return { ...finishing, vCarveEdgeFinish: true };
}

export function hasPendingRegeneration(stack: StackEntryLike[]): boolean {
    return stack.some(isPendingRegeneration);
}

/** Stage every rebuilt entry; the caller commits the returned stack once. */
export async function regenerateStack<T extends StackEntryLike>(
    stack: T[],
    options: {
        signal?: AbortSignal;
        onProgress?: (done: number, total: number, label: string) => void;
        build?: Build;
    } = {},
): Promise<{ stack: T[]; report: RegenerateStackReport }> {
    const build = options.build ?? defaultBuild;
    const total = stack.filter(isPendingRegeneration).length;
    const report: RegenerateStackReport = { failed: [], changed: [] };
    const next: T[] = [];
    let done = 0;
    for (const entry of stack) {
        if (!isPendingRegeneration(entry)) {
            next.push(entry);
            continue;
        }
        if (options.signal?.aborted)
            throw new DOMException('Toolpath rebuild cancelled.', 'AbortError');
        options.onProgress?.(done, total, entry.label);
        const stub = entry.toolpath;
        const args = finishingArgs(entry.args as ProfileArgs);
        try {
            // Rebuild on the path that made it; the sync and worker builds differ in incidental fields.
            const result = await build(
                args,
                typeof Worker !== 'undefined' &&
                    pendingRegeneration(entry)?.worker === true,
            );
            const toolpath = restoreToolpath(stub, result.toolpath);
            if (toolpathDigest(toolpath) !== pendingRegeneration(entry)?.digest)
                report.changed.push({ id: entry.id, label: entry.label });
            next.push({ ...entry, preview: previewFor(result), toolpath });
        } catch (error) {
            if (options.signal?.aborted) throw error;
            const message =
                error instanceof Error ? error.message : 'Rebuild failed.';
            report.failed.push({ id: entry.id, label: entry.label, message });
            next.push({
                ...entry,
                outputEnabled: false,
                toolpath: { ...stub, regenerationError: message },
            });
        }
        done += 1;
    }
    if (total) options.onProgress?.(total, total, '');
    return { stack: next, report };
}

export function describeRegenerationReport(
    report: RegenerateStackReport,
): string | null {
    const parts: string[] = [];
    if (report.failed.length)
        parts.push(
            `Could not rebuild ${report.failed
                .map((f) => `${f.label} (${f.message})`)
                .join(', ')}; output disabled. Edit and generate again.`,
        );
    if (report.changed.length)
        parts.push(
            `${report.changed.map((c) => c.label).join(', ')} rebuilt differently with this version of gCAM. Review before cutting.`,
        );
    return parts.length ? parts.join(' ') : null;
}
