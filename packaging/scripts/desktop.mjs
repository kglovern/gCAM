/**
 * Local desktop build: builds the React renderer, stages it into
 * packaging/desktop/www, installs the Electron deps when needed, then runs
 * the chosen action. Mirrors the CI steps in .github/workflows/native-desktop.yml.
 *
 *   node packaging/scripts/desktop.mjs [start|package|smoke|test|build] [-- extra args]
 *
 * `build` stops after staging. Args after `--` go to the final command, e.g.
 *   node packaging/scripts/desktop.mjs package -- --linux --x64
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const react = resolve(root, 'react');
const desktop = resolve(root, 'packaging/desktop');

const ACTIONS = {
    start: ['npm', ['start']],
    package: ['npm', ['run', 'package']],
    smoke: ['npm', ['run', 'smoke']],
    test: ['npm', ['test']],
    build: null,
};

const [action = 'start', ...rest] = process.argv.slice(2);
if (!(action in ACTIONS)) {
    console.error(
        `Unknown action "${action}". Use one of: ${Object.keys(ACTIONS).join(', ')}`,
    );
    process.exit(1);
}
const extra = rest[0] === '--' ? rest.slice(1) : rest;

// A Yarn 4 (PnP) parent injects its loader through NODE_OPTIONS, which breaks
// the Yarn 1 / npm children below, so drop those hooks.
const env = { ...process.env };
if (env.NODE_OPTIONS) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.split(/\s+/)
        .filter(
            (opt, i, all) =>
                !/\.pnp\.(c?js|loader\.mjs)/.test(opt) &&
                !(
                    /^--(require|experimental-loader|loader)$/.test(opt) &&
                    /\.pnp\./.test(all[i + 1] ?? '')
                ),
        )
        .join(' ');
}

function run(command, args, cwd) {
    console.log(
        `\n> ${command} ${args.join(' ')}  (${cwd.replace(root, '.') || '.'})`,
    );
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        env,
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

// Reinstall only when the lockfile changed since our last install here.
function install(dir, lockfile, command, args) {
    const marker = resolve(dir, 'node_modules/.gcam-lock-hash');
    const hash = createHash('sha256')
        .update(readFileSync(resolve(dir, lockfile)))
        .digest('hex');
    if (existsSync(marker) && readFileSync(marker, 'utf8') === hash) return;
    run(command, args, dir);
    writeFileSync(marker, hash);
}

install(react, 'yarn.lock', 'yarn', ['install', '--frozen-lockfile']);
run('yarn', ['build', '--base', './'], react);
run('node', ['packaging/scripts/stage.mjs', 'desktop'], root);
install(desktop, 'package-lock.json', 'npm', ['ci']);

const next = ACTIONS[action];
if (next) {
    const [command, args] = next;
    run(command, extra.length ? [...args, '--', ...extra] : args, desktop);
}
