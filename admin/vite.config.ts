import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Nothing clever. The admin app is one page behind a sign-in, it is looked at
// from a desk once a week, and it has no service worker, no offline story and
// no install prompt. All the interesting build configuration in this repo lives
// in the main app's vite.config.ts, and none of it is wanted here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
