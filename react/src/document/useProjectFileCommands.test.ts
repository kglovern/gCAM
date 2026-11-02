import { jest } from '@jest/globals';
import type { ProjectSnapshot } from '../lib/project';
import { DEFAULT_JOB_STOCK } from '../job/stock';
const read = jest.fn<(file: File) => Promise<ProjectSnapshot>>();
await jest.unstable_mockModule('./projectFile', () => ({
    readProjectFile: read,
    downloadProject: jest.fn(),
}));
const { useProjectFileCommands } = await import('./useProjectFileCommands');
const setup = () => {
    const cancelPendingImport = jest.fn(),
        setLoops = jest.fn(),
        setBitmaps = jest.fn();
    const options = new Proxy(
        { cancelPendingImport, setLoops, setBitmaps },
        {
            get: (target, key) =>
                key in target ? target[key as keyof typeof target] : jest.fn(),
        },
    );
    return {
        cancelPendingImport,
        setLoops,
        setBitmaps,
        commands: useProjectFileCommands(
            options as unknown as Parameters<typeof useProjectFileCommands>[0],
        ),
    };
};
beforeEach(() => read.mockReset());
test('choosing a project invalidates pending SVG work before its own asynchronous read', async () => {
    let finish!: (value: ProjectSnapshot) => void;
    read.mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const s = setup(),
        file = new File(['json'], 'new.gcam.json');
    const pending = s.commands.handleImportProject([
        file,
    ] as unknown as FileList);
    expect(s.cancelPendingImport).toHaveBeenCalledTimes(1);
    expect(s.cancelPendingImport.mock.invocationCallOrder[0]).toBeLessThan(
        read.mock.invocationCallOrder[0],
    );
    expect(s.setLoops).not.toHaveBeenCalled();
    finish({
        loops: [],
        selected: [],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'new',
        stock: DEFAULT_JOB_STOCK,
    });
    await pending;
    expect(s.setLoops).toHaveBeenCalledWith([]);
    expect(s.setBitmaps).toHaveBeenCalledWith([]);
});
test('closing the project chooser without selecting a file keeps the pending SVG import', async () => {
    const s = setup();
    await s.commands.handleImportProject(null);
    expect(s.cancelPendingImport).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
});
