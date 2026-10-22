import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2];
if (!['desktop', 'mobile'].includes(target))
    throw new Error('Choose desktop or mobile');
const source = resolve(root, 'dist-gcam-react');
const destination = resolve(root, 'packaging', target, 'www');
const html = await readFile(resolve(source, 'index.html'), 'utf8');
if (/\b(?:src|href)=["']\/(?!\/)/.test(html))
    throw new Error(
        'Native renderer requires a relative base: build with --base ./',
    );
// The only recursively replaced directory is this validated target's generated www.
if (dirname(destination) !== resolve(root, 'packaging', target))
    throw new Error('Invalid staging directory');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
    recursive: true,
    filter: (path) => !path.endsWith('/sw.js') && !path.endsWith('\\sw.js'),
});
const splash = await readFile(
    resolve(root, 'packaging/resources/startup.html'),
    'utf8',
);
let staged = html.replace(
    '<head>',
    '<head>\n    <link rel="stylesheet" href="startup.css">',
);
if (target === 'mobile')
    staged = staged.replace(
        '<head>',
        '<head>\n    <script src="cordova.js"></script>',
    );
staged = staged.replace(
    '<body>',
    `<body>\n${splash}\n<script src="startup.js"></script>`,
);
await writeFile(resolve(destination, 'index.html'), staged);
for (const name of ['startup.css', 'startup.js'])
    await cp(
        resolve(root, 'packaging/resources', name),
        resolve(destination, name),
    );
const manifest = JSON.parse(
    await readFile(resolve(root, 'packaging', target, 'package.json'), 'utf8'),
);
const iosUpdateUrl = process.env.IOS_UPDATE_URL || '';
if (
    iosUpdateUrl &&
    !/^https:\/\/(?:testflight\.apple\.com\/join\/[A-Za-z0-9]+|apps\.apple\.com\/(?:[A-Za-z]{2}\/)?app\/(?:[^/]+\/)?id\d+)$/.test(
        iosUpdateUrl,
    )
)
    throw new Error(
        'IOS_UPDATE_URL must be an Apple TestFlight invitation or App Store app URL.',
    );
await writeFile(
    resolve(destination, 'native-info.json'),
    JSON.stringify({ version: manifest.version, iosUpdateUrl }),
);
console.log(`Staged ${target} renderer`);
