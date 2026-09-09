import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind every interface, not just loopback.
    //
    // Two reasons, both learned the hard way:
    //  1. Vite's default binds ::1 only on this machine, while Chrome resolves
    //     "localhost" to 127.0.0.1 — the server answered PowerShell but showed
    //     an error page in the browser.
    //  2. Testing happens from a browser on a DIFFERENT machine, where
    //     127.0.0.1 means that machine's own loopback. It needs the LAN address.
    //
    // This exposes the dev server to the local network. Fine for a dev box on a
    // home network; it must never be how anything is served in production.
    host: true,
    port: 5180,
    // The dev box has no other services on this port; fail loudly rather than
    // silently drifting to 5181 and confusing a "why is my change not showing"
    // debug session (a real cost paid in this project before).
    strictPort: true,
  },
});
