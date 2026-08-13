import './style.css'
import { boot } from './app.js'

boot()

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW non enregistré', err))
  })
}
