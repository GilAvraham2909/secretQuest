import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly. Vite's default binds ::1 only on this machine,
    // and Chrome resolves "localhost" to 127.0.0.1 — so the dev server was
    // reachable from PowerShell but showed an error page in the browser.
    host: '127.0.0.1',
    port: 5180,
    // The dev box has no other services on this port; fail loudly rather than
    // silently drifting to 5181 and confusing a "why is my change not showing"
    // debug session (a real cost paid in this project before).
    strictPort: true,
  },
});
