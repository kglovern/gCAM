/**
 * Purpose: Implementation module for Sidebar in the components domain.
 */
import { Box, Cylinder, Layers, Settings } from 'lucide-react';
import cx from 'classnames';
import toolpathsIconUrl from '../../assets/Toolpaths.svg';

export type SideTab = 'toolpaths' | 'preview' | 'config' | 'rotary';

interface SidebarProps {
    activeTab: SideTab;
    onTabChange: (tab: SideTab) => void;
}

const tabs = [
    { id: 'toolpaths', label: 'Toolpaths', icon: Layers },
    { id: 'preview', label: 'Simulation', icon: Box },
    { id: 'config', label: 'Config', icon: Settings },
    { id: 'rotary', label: 'Rotary', icon: Cylinder },
] as const;

/**
 * gSender navbar pattern (features/navbar): full-bleed rows attached to
 * the content edge, icon + label stacked, active tab washed with a
 * horizontal gradient and a solid edge accent.
 */
export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    return (
        <div
            className={cx(
                'order-last md:order-none flex min-h-0 flex-col flex-shrink-0',
                'w-full md:w-[60px] md:min-w-[60px] md:max-w-[60px] lg:w-[76px] lg:min-w-[76px] lg:max-w-[76px]',
                'bg-white border-t md:border-t-0 md:border-r-2 border-gray-400 dark:bg-slate-800 dark:border-gray-700',
            )}
            aria-label="Main Navigation"
        >
            <nav
                className="flex min-h-0 md:-mr-[2px] flex-row md:flex-col flex-1 justify-start md:[&>button:first-child]:mt-auto overflow-y-auto overflow-x-hidden"
                role="navigation"
                aria-label="Main tabs"
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cx(
                                'flex flex-col items-center justify-center gap-1',
                                'relative flex-1 md:flex-none ml-0 md:ml-1 py-2 lg:py-6 [@media(max-height:700px)]:py-2 border-gray-400 touch-manipulation transition-colors',
                                isActive
                                    ? 'z-10 md:-mr-[2px] md:border-2 md:border-r-0 md:[border-radius:5px_0_0_5px] bg-opacity-30 bg-blue-200 dark:bg-blue-900 [background:linear-gradient(90deg,rgba(121,170,216,0.3)_40%,rgba(241,245,249,1)_100%)] dark:[background:linear-gradient(90deg,#3b82f633_40%,#1e293b)] text-blue-600 dark:text-blue-400 dark:border-gray-700'
                                    : 'text-gray-500 dark:text-gray-400',
                            )}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={tab.label}
                        >
                            {tab.id === 'toolpaths' ? (
                                <img
                                    src={toolpathsIconUrl}
                                    alt=""
                                    aria-hidden="true"
                                    className={cx(
                                        'hidden md:block h-10 w-9 lg:h-16 lg:w-14 [@media(max-height:700px)]:h-10 [@media(max-height:700px)]:w-9 flex-shrink-0 object-contain',
                                    )}
                                    style={
                                        isActive
                                            ? {
                                                  filter: 'drop-shadow(0 2px 4px rgba(63,133,199,0.65)) drop-shadow(0 0 5px rgba(104,154,201,0.35))',
                                              }
                                            : undefined
                                    }
                                />
                            ) : (
                                <Icon
                                    size={26}
                                    className={cx(
                                        'flex-shrink-0',
                                        isActive &&
                                            'drop-shadow-[0_2px_3px_rgba(104,154,201,0.75)]',
                                    )}
                                />
                            )}
                            {tab.id === 'toolpaths' && (
                                <Icon size={24} className="md:hidden" />
                            )}
                            <span className="text-[10px] lg:text-xs font-medium leading-none">
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </nav>
            <div className="hidden md:block shrink-0 p-2 border-t border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                    gCAM v0.1.0
                </div>
            </div>
        </div>
    );
}
