import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Two flags Sentry checks at build time and expects a bundler to replace.
  // Left alone they ship the SDK's own debug logging and its tracing code into
  // the crash-reporting chunk, which is downloaded at the one moment the
  // connection is least likely to be good. Setting them here takes that chunk
  // from 19.4 KB gzipped to 18.2 KB, and stops the SDK writing to the console
  // in production. Neither is used anywhere else in this app.
  define: {
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
  },
})
