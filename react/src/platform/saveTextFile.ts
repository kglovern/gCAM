interface NativeFiles {
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
