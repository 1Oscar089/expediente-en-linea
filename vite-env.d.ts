/// <reference types="vite/client" />

// Tipa las variables de entorno: autocompletado en el editor y
// error de TypeScript si una falta o está mal escrita.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_SHEET_DOCENTES_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
