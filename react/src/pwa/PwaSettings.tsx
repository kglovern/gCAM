import { Download, Tablet } from 'lucide-react';
import { installPwa, usePwa } from './client';

/** Platform-neutral install guidance remains available when no native prompt exists (iPad). */
export function PwaSettings() {
    const pwa = usePwa();
    return (
        <section className="space-y-4" aria-labelledby="pwa-heading">
            <h3
                id="pwa-heading"
                className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
                <Tablet size={16} className="text-robin-400" />
                Tablet app
            </h3>
            <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700 shadow-sm dark:border-robin-900 dark:bg-slate-800/80 dark:text-slate-200">
                <p className="font-medium text-slate-900 dark:text-white">
                    {pwa.installed
                        ? 'gCAM is running as an app'
                        : 'Add gCAM to your Home Screen'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                    Open gCAM from its own icon with more room for your drawing
                    and no browser toolbar. Both tablet orientations are
                    supported.
                </p>
                {pwa.canInstall && !pwa.installed && (
                    <button
                        type="button"
                        onClick={() => void installPwa()}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-robin-500 px-4 py-2 font-medium text-white hover:bg-robin-600"
                    >
                        <Download size={18} />
                        Install gCAM
                    </button>
                )}
                {!pwa.installed && (
                    <details className="rounded border border-slate-200 px-3 py-1 dark:border-robin-900">
                        <summary className="cursor-pointer py-2 font-medium">
                            Install on Android or iPad
                        </summary>
                        <ol className="list-decimal space-y-3 pb-3 pl-5 text-xs leading-relaxed">
                            <li>
                                <strong>Android tablet:</strong> open the
                                browser menu, choose Install app or Add to Home
                                screen, then confirm.
                            </li>
                            <li>
                                <strong>iPad:</strong> open gCAM in Safari, tap
                                Share, then Add to Home Screen. Leave Open as
                                Web App enabled if shown.
                            </li>
                            <li>
                                Launch gCAM from the new Home Screen icon. Use
                                Export Project for a backup, or to move a design
                                between the browser, installed app, and other
                                devices.
                            </li>
                        </ol>
                    </details>
                )}
                <p
                    role="status"
                    className="text-xs text-slate-500 dark:text-slate-300"
                >
                    {pwa.offlineReady
                        ? 'Ready for offline use. Optional font styles and tool photos become available offline after you use them online.'
                        : 'Open the published app online once to prepare it for offline use.'}
                </p>
                {pwa.error && (
                    <p
                        role="alert"
                        className="text-xs text-amber-700 dark:text-amber-300"
                    >
                        {pwa.error}
                    </p>
                )}
            </div>
        </section>
    );
}
