/**
 * Cloudflare Worker: Bot-Aware Prerender Proxy for locofast.com
 * 
 * Deploy this worker on locofast.com.
 * It detects search engine bots and serves pre-rendered HTML
 * from the backend instead of the React SPA.
 * 
 * Normal users get the React SPA as usual.
 * 
 * Setup:
 *   1. Install Wrangler: npm install -g wrangler
 *   2. Login: wrangler login
 *   3. Update wrangler.toml with your zone_id and route
 *   4. Deploy: wrangler deploy
 */

const BACKEND_URL = 'https://v2-launch.emergent.host';

const BOT_REGEX = /googlebot|bingbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|slackbot|telegrambot|yandex|baiduspider|semrushbot|ahrefsbot|rogerbot|embedly|quora link preview|pinterest|outbrain/i;

// Frontend path → Backend prerender endpoint
const PRERENDER_MAP = {
  '/': '/api/prerender/homepage',
  '/fabrics': '/api/prerender/fabrics',
  '/collections': '/api/prerender/collections',
};

// Pattern: /suppliers/{category}/{state}/{slug}[/...]
const SUPPLIER_REGEX = /^\/suppliers\/([^\/]+)\/([^\/]+)\/([^\/]+)/;

// File extensions to never prerender
const STATIC_REGEX = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|json|xml|txt|map|webp|gif|mp4|webm)$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const ua = request.headers.get('user-agent') || '';

    // Skip static assets and API routes
    if (path.startsWith('/api/') || STATIC_REGEX.test(path)) {
      return fetch(request);
    }

    // Check if this is a bot
    if (BOT_REGEX.test(ua)) {
      let prerenderPath = PRERENDER_MAP[path];

      // Check supplier pages
      if (!prerenderPath) {
        const supplierMatch = path.match(SUPPLIER_REGEX);
        if (supplierMatch) {
          const [, cat, state, slug] = supplierMatch;
          prerenderPath = `/api/suppliers/prerender/${cat}/${state}/${slug}`;
        }
      }

      if (prerenderPath) {
        try {
          const prerenderUrl = `${BACKEND_URL}${prerenderPath}`;
          const response = await fetch(prerenderUrl, {
            headers: { 'User-Agent': ua },
          });

          if (response.ok) {
            const html = await response.text();
            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Prerender': 'true',
                'Cache-Control': 'public, max-age=3600',
              },
            });
          }
        } catch (e) {
          // If prerender fails, fall through to normal SPA
          console.error(`Prerender failed for ${path}: ${e.message}`);
        }
      }
    }

    // Normal users (or failed prerender): serve React SPA as-is
    return fetch(request);
  },
};
