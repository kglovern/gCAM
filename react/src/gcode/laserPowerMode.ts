import { controllerPreset, type OutputSettings } from './profiles';

/** Explicit modes use verified Grbl semantics; other firmwares retain their configured inline mode. */
export function laserStartBlock(settings: OutputSettings, mode = 'profile') {
    if (!['profile', 'dynamic', 'constant'].includes(mode))
        throw new Error('Invalid laser power control.');
    const block = settings.blocks.laserStart;
    if (mode === 'profile') return block;
    if (!['grblhal', 'grbl'].includes(settings.controller))
        throw new Error(
            'Explicit speed-adjusted/constant power currently requires Grbl or grblHAL. Use Controller default for this preset.',
        );
    const command = mode === 'constant' ? 3 : 4;
    if (block.includes('{laserMode}'))
        return block.split('{laserMode}').join(String(command));
    if (block === controllerPreset(settings.controller).blocks.laserStart)
        return `M${command} S0`;
    throw new Error(
        'Custom Laser start must use M{laserMode} to follow operation power control.',
    );
}
