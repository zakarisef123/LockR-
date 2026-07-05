import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Obfuscation uniquement en production
    mode === 'production' && javascriptObfuscator({
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.4,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        // debugProtection et selfDefending désactivés : cassent l'app sur mobile
        debugProtection: false,
        debugProtectionInterval: 0,
        selfDefending: false,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 4,
        stringArrayWrappersType: 'function',
        stringArrayThreshold: 0.75,
        unicodeEscapeSequence: false,
      },
      // Exclure les chunks React core pour ne pas casser le runtime
      excludes: ['**/react/**', '**/react-dom/**'],
    }),
  ].filter(Boolean),
  build: {
    sourcemap: false, // Pas de sourcemaps en prod
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 3,
      },
      mangle: {
        toplevel: true,
        properties: false,
      },
      format: {
        comments: false, // Supprime tous les commentaires
        preamble: '/* © LOCKR SAS — Tous droits réservés. Code source protégé. Reproduction interdite. */',
      },
    },
    rollupOptions: {
      output: {
        // Noms de fichiers aléatoires à chaque build
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
}))
