import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'rollup-plugin-obfuscator'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      plugins: [
        obfuscator({
          options: {
            // Light obfuscation - minimal performance impact
            compact: true,
            simplify: true,
            stringArray: true,
            stringArrayThreshold: 0.5,
            stringArrayEncoding: ['base64'],

            // Rename variables/functions (high protection, no perf impact)
            renameGlobals: false,
            identifierNamesGenerator: 'hexadecimal',

            // Disable heavy options that hurt performance
            controlFlowFlattening: false,
            deadCodeInjection: false,
            debugProtection: false,
            disableConsoleOutput: false,
            selfDefending: false,
          }
        })
      ]
    }
  }
})
