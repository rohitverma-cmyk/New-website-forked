# SEO Prerender Setup Guide for Production

## What's Been Done (Code Level)

### 1. Critical Fix: `noindex` removed
- Changed `<meta name="robots" content="noindex, nofollow">` to `<meta name="robots" content="index, follow">` in `index.html`
- This was THE primary reason Google wasn't indexing the homepage

### 2. Static HTML meta tags (already present)
- `<title>`, `<meta description>`, OG tags, Twitter cards, JSON-LD structured data are all in the raw HTML `<head>` — not injected by JavaScript
- `<noscript>` block has meaningful content for crawlers

### 3. Dynamic Sitemap
- **Endpoint**: `GET /api/sitemap.xml`
- Generates sitemap from database (all fabrics, collections, suppliers, blog posts, tool pages)
- Static fallback: `public/sitemap.xml` with 17 core pages

### 4. Prerender Endpoints (for Googlebot)
- `GET /api/prerender/homepage` — Full HTML homepage
- `GET /api/prerender/fabrics` — Fabric catalog with real data
- `GET /api/prerender/collections` — Collections page
- `GET /api/prerender/check?path=/` — Bot detection utility
- Supplier pages already handled by `supplier_router.py`

### 5. Updated `robots.txt`
- Allows `/api/sitemap.xml` and `/api/prerender/` while blocking other `/api/` routes

---

## What You Need To Do (Production Config)

### Step 1: Request Re-indexing (Do This NOW)
1. Go to [Google Search Console](https://search.google.com/search-console)
2. URL Inspection → enter `locofast.com`
3. Click "Request Indexing"
4. Submit sitemap: `https://locofast.com/api/sitemap.xml`

### Step 2: Deploy the code changes
The `noindex` → `index, follow` fix, static hero shell, and bot middleware need to be deployed.

### Step 3: Bot Routing — Choose ONE Option

#### Option 1: Cloudflare Worker (Recommended — 15 min)
A ready-to-deploy worker is at `/app/cloudflare-worker/worker.js`.

```bash
cd /app/cloudflare-worker
npm install -g wrangler
wrangler login
# Edit wrangler.toml: add your account_id and zone_id
wrangler deploy
```

The worker intercepts Googlebot/Bingbot/Twitterbot/Facebook requests and serves pre-rendered HTML from `v2-launch.emergent.host/api/prerender/*`.

#### Option 2: Backend Middleware (Already Built)
If all traffic routes through the FastAPI backend (v2-launch.emergent.host), the `BotPrerenderMiddleware` in `bot_prerender_middleware.py` handles everything automatically. No additional config needed — it detects bots and internally fetches prerendered HTML.

#### Option 3: Nginx Config (If using Nginx)
```nginx
# Add to your server block
map $http_user_agent $is_bot {
    default 0;
    ~*googlebot 1;
    ~*bingbot 1;
    ~*yandex 1;
    ~*facebookexternalhit 1;
    ~*twitterbot 1;
    ~*linkedinbot 1;
    ~*whatsapp 1;
    ~*slackbot 1;
}

location = / {
    if ($is_bot) {
        proxy_pass https://v2-launch.emergent.host/api/prerender/homepage;
    }
    # Normal users get React SPA
    try_files $uri /index.html;
}

location = /fabrics {
    if ($is_bot) {
        proxy_pass https://v2-launch.emergent.host/api/prerender/fabrics;
    }
    try_files $uri /index.html;
}

location = /collections {
    if ($is_bot) {
        proxy_pass https://v2-launch.emergent.host/api/prerender/collections;
    }
    try_files $uri /index.html;
}

# Supplier pages already have prerender at /api/suppliers/prerender/
location ~ ^/suppliers/(.+)/(.+)/(.+) {
    if ($is_bot) {
        proxy_pass https://v2-launch.emergent.host/api/suppliers/prerender/$1/$2/$3;
    }
    try_files $uri /index.html;
}
```

#### Option 4: Cloudflare Worker (Alternative)
```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const BOT_REGEX = /googlebot|bingbot|yandex|facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot/i;
const BACKEND = 'https://v2-launch.emergent.host';

const PRERENDER_MAP = {
  '/': '/api/prerender/homepage',
  '/fabrics': '/api/prerender/fabrics',
  '/collections': '/api/prerender/collections',
};

async function handleRequest(request) {
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  
  if (BOT_REGEX.test(ua)) {
    // Check static prerender routes
    const prerenderPath = PRERENDER_MAP[url.pathname];
    if (prerenderPath) {
      return fetch(`${BACKEND}${prerenderPath}`);
    }
    
    // Check supplier pages
    const supplierMatch = url.pathname.match(/^\/suppliers\/(.+)\/(.+)\/(.+)/);
    if (supplierMatch) {
      return fetch(`${BACKEND}/api/suppliers/prerender/${supplierMatch[1]}/${supplierMatch[2]}/${supplierMatch[3]}`);
    }
  }
  
  // Normal users: pass through to origin
  return fetch(request);
}
```

---

## Summary of SEO Fixes

| Fix | Impact | Status |
|-----|--------|--------|
| Remove `noindex, nofollow` | **CRITICAL** — Google was explicitly blocked | Done in code |
| Meta tags in static HTML | HIGH — title & description visible without JS | Done in code |
| Static hero shell (LCP fix) | HIGH — hero renders in HTML before JS | Done in code |
| Font preload + critical CSS | HIGH — Inter 600 loads instantly | Done in code |
| Dynamic sitemap with all pages | HIGH — Google discovers all content | Done in code |
| Prerender endpoints for bots | HIGH — Googlebot gets full HTML | Done in code |
| Bot detection middleware | HIGH — Auto-routes bots to prerender | Done in code |
| Cloudflare Worker | HIGH — Production bot routing | Ready at `/app/cloudflare-worker/` |
| Request re-indexing in GSC | HIGH — Forces Google to re-crawl | **Manual step** |
