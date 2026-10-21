import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toolbarButton } from './styles';

const InlineToolbarContext = createContext(false);
export const useInlineToolbar = () => useContext(InlineToolbarContext);

/** Phone-only overflow keeps secondary commands named and within the viewport. */
export function ToolbarOverflow({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !root.current?.contains(event.target)
            )
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        window.addEventListener('pointerdown', dismiss);
        window.addEventListener('keydown', escape);
        return () => {
            window.removeEventListener('pointerdown', dismiss);
            window.removeEventListener('keydown', escape);
        };
    }, [open]);
    return (
        <div ref={root}>
            <button
                ref={toggle}
                type="button"
                aria-label="More tools"
                title="More tools"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className={toolbarButton}
            >
                <MoreHorizontal size={20} />
            </button>
            {open && (
                <div
                    role="group"
                    aria-label="More canvas tools"
                    className="absolute right-2 top-full z-50 mt-1 max-h-[calc(100dvh-140px)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-robin-900 dark:bg-dark [&>span]:hidden"
                    onClick={(event) => {
                        const button =
                            event.target instanceof Element
                                ? event.target.closest('button')
                                : null;
                        if (button && !button.hasAttribute('aria-expanded')) {
                            setOpen(false);
                            toggle.current?.focus();
                        }
                    }}
                >
                    <InlineToolbarContext.Provider value={true}>
                        {children}
                    </InlineToolbarContext.Provider>
                </div>
            )}
        </div>
    );
}
