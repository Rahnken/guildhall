import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Lets a Cloudflare quick tunnel reach the dev server, for testing Discord.
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
})
