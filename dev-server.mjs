// Serveur de developpement : Vite et les fonctions api/*.js dans le meme
// processus. `npm run dev` ne sert que le site - Vite ne connait pas api/, et
// tout appel au serveur repond alors 404, ce qui rend l'ecran de code
// infranchissable sur un appareil pas encore deverrouille.
//
// C'est l'equivalent local de `vercel dev`, qui echoue sous Windows : sa mise
// en place cree des liens symboliques, refuses sans le mode developpeur.
//
// `npm run dev:api`, apres avoir copie .env.example en .env. La production,
// elle, ne passe jamais par ici : Vercel execute les memes fichiers api/.
import { createServer as createHttpServer } from 'node:http'
import { createServer as createViteServer } from 'vite'

const PORT = Number(process.env.PORT) || 5173

async function lireCorps(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {}
  const morceaux = []
  for await (const m of req) morceaux.push(m)
  const brut = Buffer.concat(morceaux).toString('utf8')
  try {
    return brut ? JSON.parse(brut) : {}
  } catch {
    return {}
  }
}

async function main() {
  const vite = await createViteServer({ server: { middlewareMode: true } })

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) {
      const nom = url.pathname.slice('/api/'.length).split('/')[0]
      let mod
      try {
        mod = await import(`./api/${nom}.js`)
      } catch {
        res.statusCode = 404
        res.end('Fonction inconnue : ' + nom)
        return
      }
      req.query = Object.fromEntries(url.searchParams)
      req.body = await lireCorps(req)
      res.status = (code) => {
        res.statusCode = code
        return res
      }
      res.json = (obj) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(obj))
      }
      try {
        await mod.default(req, res)
      } catch (err) {
        console.error(`[api/${nom}]`, err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Erreur serveur (dev local)' }))
        }
      }
      return
    }
    vite.middlewares(req, res)
  })

  server.listen(PORT, () => {
    console.log(`Atout Flair (dev local, vite + api/) -> http://localhost:${PORT}`)
    if (!process.env.APP_CODE) console.warn('APP_CODE absent : le verrou refusera tous les codes.')
  })
}

main()
