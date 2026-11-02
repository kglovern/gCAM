import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from 'react';
import type { WorkerSegmentsData } from '@sienci/gviewer';
import type { GCodeViewerHandle } from '@sienci/gviewer/viewer';
import type { TimedPreviewPlan } from '../gcode/estimateTime';
import { createPreviewCursor } from './previewCursor';
import { createTimedPreviewCursor } from './timedPreviewCursor';

export function usePreviewPlayback(
    viewer: RefObject<GCodeViewerHandle>,
    plan?: TimedPreviewPlan,
) {
    const data = useRef<ReturnType<typeof createPreviewCursor> | null>(null);
    const timedCursor = useRef<ReturnType<
        typeof createTimedPreviewCursor
    > | null>(null);
    const proposed = useRef(plan);
    const frame = useRef<number | undefined>(undefined);
    const generation = useRef(0);
    const current = useRef(0),
        limit = useRef(0);
    const lineRate = useRef(100),
        timeRate = useRef(1),
        rate = useRef(100);
    const [line, setLine] = useState(0),
        [total, setTotal] = useState(0);
    const [position, setPosition] = useState(0),
        [duration, setDuration] = useState(0);
    const [timed, setTimed] = useState(false);
    const [playing, setPlaying] = useState(false),
        [speed, setSpeed] = useState(100);
    const cancel = useCallback(() => {
        generation.current++;
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
        frame.current = undefined;
    }, []);
    const pause = useCallback(() => {
        cancel();
        setPlaying(false);
        viewer.current?.setBitSpinning(false);
    }, [cancel, viewer]);
    const move = useCallback(
        (next: number) => {
            const cursor = data.current,
                handle = viewer.current;
            if (!cursor || !handle || !Number.isFinite(next)) return;
            const value = Math.max(
                0,
                Math.min(
                    limit.current,
                    timedCursor.current ? next : Math.round(next),
                ),
            );
            const sample = timedCursor.current?.sample(value);
            const completed = sample ? sample.completedLines : value;
            current.current = value;
            setPosition(value);
            setLine(completed);
            handle.seekToLine(completed - 1, 'grey');
            const point = sample ? sample.position : cursor.position(completed);
            handle.setBitVisible(Boolean(point));
            if (point) handle.setBitPosition(point, { immediate: true });
        },
        [viewer],
    );
    const activate = useCallback(
        (next?: TimedPreviewPlan) => {
            pause();
            timedCursor.current =
                next &&
                next.lineCount === data.current?.lines &&
                next.seconds > 0
                    ? createTimedPreviewCursor(next)
                    : null;
            const active = Boolean(timedCursor.current);
            limit.current =
                timedCursor.current?.seconds ?? data.current?.lines ?? 0;
            rate.current = active ? timeRate.current : lineRate.current;
            current.current = 0;
            setTimed(active);
            setSpeed(rate.current);
            setDuration(limit.current);
            setLine(0);
            setPosition(0);
            if (data.current) {
                viewer.current?.showAll();
                viewer.current?.resetColors();
            }
            viewer.current?.setBitVisible(false);
        },
        [pause, viewer],
    );
    const clear = useCallback(() => {
        data.current = null;
        activate();
        setTotal(0);
    }, [activate]);
    const load = useCallback(
        (segments: WorkerSegmentsData) => {
            clear();
            const cursor = createPreviewCursor(segments);
            if (!cursor.vertices) return false;
            data.current = cursor;
            setTotal(cursor.lines);
            activate(proposed.current);
            return true;
        },
        [clear, activate],
    );
    const seek = useCallback(
        (value: number) => {
            pause();
            move(value);
        },
        [pause, move],
    );
    const reset = useCallback(() => {
        pause();
        move(0);
        viewer.current?.showAll();
        viewer.current?.resetColors();
        if (!timedCursor.current) viewer.current?.setBitVisible(false);
    }, [pause, move, viewer]);
    const play = useCallback(() => {
        const cursor = data.current;
        if (!cursor?.lines || !limit.current) return;
        pause();
        if (current.current >= limit.current) move(0);
        const token = generation.current;
        let progress = current.current,
            previous: number | undefined,
            drawn = -Infinity;
        setPlaying(true);
        const tick = (now: number) => {
            if (token !== generation.current || cursor !== data.current) return;
            if (previous !== undefined)
                progress += (Math.max(0, now - previous) * rate.current) / 1000;
            previous = now;
            if (now - drawn >= 33 || progress >= limit.current) {
                move(timedCursor.current ? progress : Math.floor(progress));
                drawn = now;
            }
            if (progress >= limit.current) {
                pause();
                return;
            }
            frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
    }, [pause, move]);
    useEffect(() => {
        proposed.current = plan;
        activate(plan);
    }, [plan, activate]);
    useEffect(() => {
        const hidden = () => {
            if (document.hidden) pause();
        };
        document.addEventListener('visibilitychange', hidden);
        return () => {
            document.removeEventListener('visibilitychange', hidden);
            cancel();
        };
    }, [pause, cancel]);
    return {
        line,
        total,
        position,
        duration,
        timed,
        playing,
        speed,
        load,
        clear,
        play,
        pause,
        seek,
        reset,
        setSpeed(value: number) {
            const values = timedCursor.current
                ? [0.25, 0.5, 1, 2, 5, 10, 50]
                : [25, 100, 500, 2000, 10000];
            if (!values.includes(value)) return;
            if (timedCursor.current) timeRate.current = value;
            else lineRate.current = value;
            rate.current = value;
            setSpeed(value);
        },
    };
}
