import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { pwa } from './build/pwa';

// gCAM React shell — mirrors gSender src/app Vite setup (web-first; Electron later).
export default defineConfig({
    base: process.env.GITHUB_ACTIONS ? '/gCAM/' : '/',
    plugins: [react(), tsconfigPaths(), pwa()],
    server: {
        port: 5174,
        host: true,
    },
    build: {
        outDir: '../dist-gcam-react',
        emptyOutDir: true,
        chunkSizeWarningLimit: 2048,
    },
});
