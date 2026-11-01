interface NativeFiles {
    saveBinary?(
        name: string,
        base64: string,
        mime: string,
        success: () => void,
        failure: (error: string) => void,
    ): void;
    save(
        name: string,
        text: string,
        mime: string,
        success: () => void,
        failure: (error: string) => void,
    ): void;
}
type NativeWindow = Window & { cordova?: unknown; gcamFiles?: NativeFiles };

/** Shared export boundary: browser/Electron download or tablet system document picker. */
export function saveTextFile(
    text: string,
    name: string,
    mime = 'text/plain',
): void {
    const runtime = window as NativeWindow;
    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || 'gcam';
    if (runtime.cordova) {
        if (!runtime.gcamFiles) {
            window.alert('File export is not ready. Please reopen the app.');
            return;
        }
        runtime.gcamFiles.save(
            safeName,
            text,
            mime,
            () => {},
            (error) => {
                if (error !== 'CANCELLED')
                    window.alert(`Could not save file: ${error}`);
            },
        );
        return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Preserve bytes on native pickers; never encode binary data as UTF-8 text. */
export async function saveBinaryFile(blob: Blob, name: string): Promise<void> {
    const runtime = window as NativeWindow;
    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || 'gcam';
    if (runtime.cordova) {
        const files = runtime.gcamFiles;
        if (!files?.saveBinary)
            throw new Error(
                'Binary file export is not ready. Please reopen the app.',
            );
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () =>
                reject(new Error('Could not read export data.'));
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.readAsDataURL(blob);
        });
        await new Promise<void>((resolve, reject) => {
            files.saveBinary!(
                safeName,
                base64,
                blob.type || 'application/octet-stream',
                resolve,
                (error) =>
                    error === 'CANCELLED'
                        ? resolve()
                        : reject(new Error(error)),
            );
        });
        return;
    }
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = safeName;
        link.click();
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
