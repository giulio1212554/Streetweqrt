# Come aprire PROJECT LAB come app sul telefono

## 1) Pubblica online (consigliato, 2 minuti)

Da computer, nella cartella del progetto:

```bash
npm install
npm run build
```

Poi carica su uno di questi (gratis):

- **Vercel**: https://vercel.com → Import project → cartella `pianoliguori-main`
- **Netlify**: https://netlify.com → Deploy
- **Cloudflare Pages**

Apri il link dal telefono → Safari/Chrome → **Condividi → Aggiungi a Home**  
Avrai un’icona **PLAB** come un’app.

Per Stripe in produzione: metti le chiavi in Environment Variables del host:
`STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`

## 2) Stessa Wi‑Fi del PC

Sul PC:
```bash
npm install
npm run dev -- --host 0.0.0.0
```
Sul telefono apri `http://IP-DEL-PC:3000` (es. `http://192.168.1.12:3000`)

## 3) Solo Android senza PC

Installa **Termux** dallo store, poi:
```bash
pkg install nodejs git
# copia/scompatta il progetto
cd pianoliguori-main
npm install
npm run dev -- --host 0.0.0.0
```
Apri Chrome su `http://127.0.0.1:3000`

## Cosa NON serve

Non serve un’app Android/iOS separata: il sito è già **PWA** (Progressive Web App).
