import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Shared renderer: Pages uses /gCAM/; native packaging passes --base ./ explicitly.
export default defineConfig({
    base: process.env.GITHUB_ACTIONS ? '/gCAM/' : '/',
    plugins: [react(), tsconfigPaths()],
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
