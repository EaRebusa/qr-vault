import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        'content/snip-overlay': 'src/content/snip-overlay.ts',
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'content/snip-overlay') {
            return 'content/snip-overlay.js'
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})

