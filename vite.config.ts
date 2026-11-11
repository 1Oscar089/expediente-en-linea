import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // ── LA ÚNICA LÍNEA AÑADIDA AL SCAFFOLD ──
  // "base" controla el prefijo de TODAS las rutas de assets en el build.
  //  - GitHub Pages sirve el sitio en una SUBCARPETA (/expediente-en-linea/),
  //    y el workflow de Pages inyecta BASE_PATH por entorno.
  //  - Firebase Hosting y tu PC (dev/preview) sirven en la raíz "/", y al no
  //    existir BASE_PATH se queda en "/", que es el valor por defecto.
  base: process.env.BASE_PATH || '/',

  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

// NOTA: si al correr `npm run type-check` Vue se queja de que no conoce
// "process", instala los tipos de Node:  npm i -D @types/node
