/**
 * Purpose: Implementation module for history in the lib domain.
 */
export interface History<T> {
    undo: T[];
    redo: T[];
    limit: number;
    clone: (value: T) => T;
}

const sharedHistoryData = new WeakSet<object>();

/** Seal output geometry in short slices so preparing Undo does not block the UI. */
export async function freezeHistoryData<T>(
    value: T,
    signal?: AbortSignal,
): Promise<T> {
    if (signal?.aborted) return value;
    const visiting = new WeakSet<object>();
    function* freeze(item: unknown): Generator<void, boolean, undefined> {
        yield;
        if (typeof item === 'function') return false;
        if (item === null || typeof item !== 'object') return true;
        if (sharedHistoryData.has(item)) return true;
        const prototype = Object.getPrototypeOf(item);
        if (
            (!Array.isArray(item) &&
                prototype !== Object.prototype &&
                prototype !== null) ||
            visiting.has(item)
        )
            return false;
        visiting.add(item);
        for (const key of Reflect.ownKeys(item)) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
            if (
                descriptor.get ||
                descriptor.set ||
                !(yield* freeze(descriptor.value))
            )
                return false;
        }
        Object.freeze(item);
        sharedHistoryData.add(item);
        return true;
    }
    const walk = freeze(value);
    let deadline = performance.now() + 6,
        count = 0;
    while (!walk.next().done) {
        if (++count % 128 !== 0) continue;
        if (signal?.aborted) return value;
        if (performance.now() >= deadline) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            deadline = performance.now() + 6;
        }
    }
    return value;
}

function defaultClone<T>(value: T): T {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep-copy document data while omitting runtime methods on geometry objects. */
export function cloneHistoryData<T>(value: T): T {
    return cloneHistoryValue(value, new WeakMap()) as T;
}

function cloneHistoryValue(
    value: unknown,
    seen: WeakMap<object, unknown>,
): unknown {
    if (typeof value === 'function') return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (sharedHistoryData.has(value)) return value;

    const existing = seen.get(value);
    if (existing !== undefined) return existing;
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) {
        if (value instanceof DataView) {
            return new DataView(
                value.buffer.slice(
                    value.byteOffset,
                    value.byteOffset + value.byteLength,
                ),
            );
        }
        return (
            value as ArrayBufferView & { slice(): ArrayBufferView }
        ).slice();
    }

    if (typeof ImageData !== 'undefined' && value instanceof ImageData) {
        return new ImageData(
            new Uint8ClampedArray(value.data),
            value.width,
            value.height,
        );
    }

    if (Array.isArray(value)) {
        const copy: unknown[] = [];
        seen.set(value, copy);
        for (const item of value) copy.push(cloneHistoryValue(item, seen));
        return copy;
    }

    if (value instanceof Map) {
        const copy = new Map();
        seen.set(value, copy);
        for (const [key, item] of value)
            copy.set(
                cloneHistoryValue(key, seen),
                cloneHistoryValue(item, seen),
            );
        return copy;
    }

    if (value instanceof Set) {
        const copy = new Set();
        seen.set(value, copy);
        for (const item of value) copy.add(cloneHistoryValue(item, seen));
        return copy;
    }

    const prototype = Object.getPrototypeOf(value);
    const copy = Object.create(prototype === null ? null : Object.prototype);
    seen.set(value, copy);
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'function')
            copy[key] = cloneHistoryValue(item, seen);
    }
    return copy;
}

export function createHistory<T>(
    limit = 60,
    clone: (value: T) => T = defaultClone,
): History<T> {
    return { undo: [], redo: [], limit, clone };
}

export function pushHistory<T>(h: History<T>, snapshot: T): void {
    h.undo.push(h.clone(snapshot));
    if (h.undo.length > h.limit) h.undo.shift();
    h.redo = [];
}

export function undoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.undo.pop();
    if (!snap) return null;
    h.redo.push(h.clone(current));
    return snap;
}

export function redoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.redo.pop();
    if (!snap) return null;
    h.undo.push(h.clone(current));
    return snap;
}
