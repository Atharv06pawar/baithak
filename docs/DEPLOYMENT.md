# BaithakOS — Mobile Operation & Deployment Guide

> **Zero-Cost, Offline-First PWA Deployment**  
> Run on any smartphone (Android / iOS) without app store dependencies.

---

## 1. Mobile Phone Access & PWA Installation

BaithakOS is engineered as a **Progressive Web App (PWA)** with a standalone app shell, touch-friendly min-48px touch targets, mobile safe-area insets, and offline IndexedDB persistence.

### Accessing on Mobile over Local Wi-Fi (Instant)

If your development machine and your mobile phone are connected to the same Wi-Fi network:

1. Look up the local network IP:
   ```text
   http://10.59.57.35:3000
   ```
2. Open this address in your mobile phone browser (Chrome, Edge, or Safari).
3. The app loads instantly with the mobile-optimized interface.

### Installing to Mobile Home Screen

- **Android (Chrome / Edge / Samsung Internet):**
  - Tap the **"Install App"** banner at the top, or tap the three dots `⋮` in Chrome → **"Add to Home screen"** / **"Install app"**.
  - BaithakOS will be installed with its custom icon on your home screen and launcher.
  - Launches in fullscreen standalone mode (no browser address bar) and works completely offline!

- **iPhone / iOS (Safari):**
  - Open `http://10.59.57.35:3000` (or your hosted domain) in Safari.
  - Tap the **Share** button (square with arrow pointing up).
  - Scroll down and tap **"Add to Home Screen"**.
  - Tap **Add**. The BaithakOS icon appears on your home screen.

---

## 2. Production Cloud Hosting Options ($0 Cost)

Because BaithakOS uses `output: 'export'` in `next.config.ts`, `npm run build` generates a standalone static distribution in the `out/` directory. No Node.js server or backend infrastructure is required.

---

### Option A: Cloudflare Pages (Recommended)

*Cloudflare Pages is the preferred host for BaithakOS. It provides free global CDN, unlimited bandwidth, instant SSL, and zero server maintenance.*

#### Via Cloudflare Dashboard & GitHub (Easiest)
1. Push this repository to GitHub (or GitLab):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/baithak-os.git
   git push -u origin master
   ```
2. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Select the `baithak-os` repository.
4. Configure build settings:
   - **Framework preset:** `Next.js (Static Export)`
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
5. Click **Save and Deploy**.
6. Your shop is live at `https://baithak-os.pages.dev` with free SSL and automatic deployments on git push!

#### Via Wrangler CLI
```bash
# Build static distribution
npm run build

# Deploy directly to Cloudflare Pages
npx wrangler pages deploy out --project-name baithak-os
```

---

### Option B: Vercel (1-Click Deployment)

1. Run:
   ```bash
   npx vercel
   ```
2. Follow the interactive prompts (select your team/account).
3. Vercel automatically deploys the project with HTTPS at `https://baithak-os.vercel.app`.

---

### Option C: GitHub Pages

1. In `package.json`, add:
   ```json
   "scripts": {
     "deploy": "next build && npx gh-pages -d out"
   }
   ```
2. Run:
   ```bash
   npm install --save-dev gh-pages
   npm run deploy
   ```

---

## 3. Verifying Mobile PWA Features

| Feature | Verification Method |
|---|---|
| **Standalone Display** | Open from home screen: browser navigation bar is hidden. |
| **Touch Optimization** | All tap targets >= 48px; no double-tap zoom delay. |
| **Offline Operation** | Turn on Airplane Mode: POS, Cart, Sales, Inventory, and Khata continue to function. |
| **Data Persistence** | Hard refresh / restart browser: all transactions, products, and customer records persist in IndexedDB. |
| **Responsive Cart** | On mobile, a floating `View Cart & Pay →` pill appears when items are added; opens a drawer sheet for fast counter operation. |
