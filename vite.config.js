import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const ici = (chemin) => fileURLToPath(new URL(chemin, import.meta.url))

// Deux applis, un seul projet : Terrain a la racine, le Bureau sous /bureau/.
// L'entree de Terrain garde le nom "index" : les telephones deja installes
// reconnaissent ainsi leurs mises a jour (voir src/mise-a-jour.js).
export default defineConfig({
  server: { host: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        index: ici('./index.html'),
        bureau: ici('./bureau/index.html'),
        confidentialite: ici('./confidentialite/index.html'),
      },
    },
  },
})
