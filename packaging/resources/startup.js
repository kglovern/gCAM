/* Native startup waits for the editor and, on tablets, Cordova's device bridge. */
(() => {
    let editorReady = false;
    let deviceReady = !window.cordova;
    const screen = document.getElementById('gcam-startup');
    const status = document.getElementById('gcam-startup-status');
    const retry = document.getElementById('gcam-startup-retry');
    if (!screen) return;
    const finish = () => {
        if (!editorReady || !deviceReady) return;
        screen.classList.add('gcam-ready');
        window.setTimeout(
            () => screen.remove(),
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 0
                : 180,
        );
    };
    const failed = () => {
        if (!screen.isConnected) return;
        screen.classList.add('gcam-failed');
        status.textContent = 'The workspace could not start.';
        retry.hidden = false;
    };
    retry.addEventListener('click', () => window.location.reload());
    document.addEventListener(
        'gcam-ready',
        () => {
            editorReady = true;
            finish();
        },
        { once: true },
    );
    document.addEventListener(
        'deviceready',
        () => {
            deviceReady = true;
            finish();
        },
        { once: true },
    );
    document.addEventListener('gcam-startup-error', failed);
    window.addEventListener('error', failed);
    window.addEventListener('unhandledrejection', failed);
})();
