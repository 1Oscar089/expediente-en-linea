# Instalación del proyecto — Expediente en Línea

Sistema de gestión escolar construido con **Vue 3 + Vite + TypeScript + Tailwind CSS**.
Este documento explica cómo dejar el proyecto funcionando después de clonarlo o hacer `git pull`,
incluyendo todo lo que **no se sube a GitHub** y debe regenerarse en cada máquina.

---

## 1. Requisitos previos

| Herramienta | Versión | Verificación |
|---|---|---|
| Node.js (incluye npm) | 26 LTS (mínimo 22) | `node -v` |
| Git | versión reciente | `git --version` |

Editor recomendado: **VS Code** con las extensiones **Vue - Official**, **Tailwind CSS IntelliSense**, **ESLint** y **Prettier**.

---

## 2. Clonar y arrancar

```bash
git clone https://github.com/TU-USUARIO/expediente-en-linea.git
cd expediente-en-linea
npm install        # primera vez, o cuando cambie package-lock.json
npm run dev        # abre http://localhost:5173
```

---

## 3. Variables de entorno

Las variables con prefijo `VITE_` llegan al navegador; por eso **nunca** se colocan ahí
credenciales de servidor. Los archivos de entorno son:

| Archivo | ¿Se sube a GitHub? | Para qué sirve |
|---|---|---|
| `.env.ejemplo` | ✅ Sí | plantilla con los nombres de variables, valores vacíos |
| `.env.local` | ❌ No (está en `.gitignore`) | tus valores reales, solo en tu máquina |

**Pasos:**

```bash
cp .env.ejemplo .env.local
```

Luego pega tus valores reales. Se obtienen de:
**Firebase Console → Configuración del proyecto → General → Tus apps → Configuración de SDK**
(si aún no hay una app web registrada, primero registra una con el ícono `</>`).

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

En el código se leen así: `import.meta.env.VITE_FIREBASE_API_KEY` (y así con cada una).

⚠️ **Nunca subas ni compartas `.env.local`.** Si un compañero necesita los valores,
debe crear su propio `.env.local` a partir de `.env.ejemplo`.

---

## 4. Lo que NO está en el repo y cómo se regenera

Esto es lo que falta tras clonar o hacer `pull`, y su comando de regeneración:

| Lo que falta | Se regenera con |
|---|---|
| `node_modules/` | `npm install` (o `npm ci` para versiones exactas del lockfile) |
| `.env.local` | copiar `.env.ejemplo` → `.env.local` y llenar los valores |
| `dist/` | `npm run build` (solo para pruebas locales; el deploy lo genera solo) |

---

## 5. Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo con recarga automática (localhost:5173) |
| `npm run build` | compila a `dist/` para producción; incluye revisión de TypeScript |
| `npm run type-check` | revisa errores de TypeScript sin compilar |
| `npm run preview` | sirve el build local para revisarlo antes de publicar |

---

## 6. Deploy automático

Cada `push` a `main` dispara dos workflows en GitHub Actions (no hay que hacer nada manual):

| Deploy | URL final | Workflow |
|---|---|---|
| GitHub Pages | `https://TU-USUARIO.github.io/expediente-en-linea/` | `.github/workflows/deploy-pages.yml` |
| Firebase Hosting | `https://expediente-en-linea1.web.app` | `.github/workflows/deploy-firebase.yml` |

Si un workflow aparece en rojo, revisa la pestaña **Actions** del repo y lee el paso que falló.

---

## 7. Si se agrega una variable `VITE_` nueva

Una variable de entorno nueva debe crearse en **3 sitios** para que todo siga funcionando:

1. `.env.local` (local).
2. `.env.ejemplo` (repo, como plantilla).
3. **Secrets** del repo en GitHub: Settings → Secrets and variables → Actions
   (CI no lee `.env.local`; sin este paso, el deploy compila sin esa variable).
