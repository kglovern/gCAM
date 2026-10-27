/**
 * Purpose: Config panel section for pairing gSender pendant tablets.
 * Desktop app only.
 */
import { Tablet } from 'lucide-react';
import { useState } from 'react';
import cx from 'classnames';
import { PairTabletDialog } from './PairTabletDialog';
import { isPendantAvailable } from './pendantBridge';
import { usePendantTablets } from './usePendantTablets';

export function TabletSettings() {
    if (!isPendantAvailable()) return null;
    return <TabletSettingsSection />;
}

function TabletSettingsSection() {
    const { pairedTablets, refresh, forget } = usePendantTablets();
    const [pairing, setPairing] = useState(false);

    return (
        <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Tablet size={16} className="text-robin-400" />
                Tablet
            </h3>
            <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pair a tablet running gSender to send programs straight to
                    it. Turn on <b>Remote File Receive</b> on the tablet first.
                </p>
                {pairedTablets.length > 0 ? (
                    <ul className="divide-y divide-slate-200 dark:divide-robin-900/70">
                        {pairedTablets.map((tablet) => (
                            <li
                                key={tablet.id}
                                className="flex min-h-11 items-center gap-3 py-2"
                            >
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'h-2 w-2 shrink-0 rounded-full',
                                        tablet.online
                                            ? 'bg-emerald-500'
                                            : 'bg-slate-400',
                                    )}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                        {tablet.name}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {tablet.online ? 'Online' : 'Not seen'}
                                        {tablet.host
                                            ? ` · ${tablet.host}:${tablet.port}`
                                            : ''}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void forget(tablet.id)}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark-lighter"
                                >
                                    Forget
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        No tablets paired.
                    </p>
                )}
                <button
                    type="button"
                    onClick={() => setPairing(true)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark-lighter"
                >
                    Pair new tablet
                </button>
            </div>
            {pairing && (
                <PairTabletDialog
                    onClose={() => setPairing(false)}
                    onPaired={() => {
                        setPairing(false);
                        void refresh();
                    }}
                />
            )}
        </section>
    );
}
