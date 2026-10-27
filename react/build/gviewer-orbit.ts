// shortcut: gviewer 0.1.39 reverses pitch; remove when it offers standard orbit controls.
export const standardGviewerOrbit = {
    name: 'gviewer-standard-orbit',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
        if (!id.replace(/\\/g, '/').includes('/@sienci/gviewer/dist/'))
            return null;
        const result = code.replace(
            /(\b[\w$]+\.prototype\._rotateUp\.call\(this,\s*)-(\w+)(\s*\))/g,
            '$1$2$3',
        );
        return result === code ? null : { code: result, map: null };
    },
};
