// PUNTO DE ENTRADA. Piezas globales: Pinia (estado), Router (URLs),
// estilos y Firebase. El ORDEN importa: Pinia antes del router,
// porque el guard del router usa el store de autenticación.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import './lib/firebase'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
