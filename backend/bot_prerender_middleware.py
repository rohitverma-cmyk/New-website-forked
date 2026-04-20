"""
Bot-Aware Prerender Middleware for FastAPI.

When a search engine bot requests a public page, this middleware
intercepts the request and serves fully rendered HTML from the
prerender endpoints instead of letting it fall through to the
React SPA (which bots can't execute).

Normal users get the React SPA as usual.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse
import re
import logging
import httpx

logger = logging.getLogger(__name__)

# Bot patterns to detect
BOT_PATTERN = re.compile(
    r'googlebot|bingbot|twitterbot|facebookexternalhit|'
    r'linkedinbot|whatsapp|slackbot|telegrambot|'
    r'yandex|baiduspider|semrushbot|ahrefsbot|'
    r'rogerbot|embedly|quora link preview|pinterest|outbrain',
    re.IGNORECASE
)

# Map of frontend paths → backend prerender endpoints
PRERENDER_MAP = {
    '/': '/api/prerender/homepage',
    '/fabrics': '/api/prerender/fabrics',
    '/collections': '/api/prerender/collections',
}

# Pattern for supplier pages: /suppliers/{category}/{state}/{slug}
SUPPLIER_PATTERN = re.compile(r'^/suppliers/([^/]+)/([^/]+)/([^/]+)')

# File extensions to skip
STATIC_PATTERN = re.compile(r'\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|json|xml|txt|map|webp|gif|mp4)$', re.IGNORECASE)


class BotPrerenderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip('/')
        if not path:
            path = '/'

        ua = request.headers.get('user-agent', '')

        # Only intercept non-API, non-static paths for bots
        if (
            BOT_PATTERN.search(ua)
            and not path.startswith('/api/')
            and not path.startswith('/static/')
            and not STATIC_PATTERN.search(path)
        ):
            prerender_path = PRERENDER_MAP.get(path)

            # Check supplier pages
            if not prerender_path:
                match = SUPPLIER_PATTERN.match(path)
                if match:
                    cat, state, slug = match.groups()
                    prerender_path = f'/api/suppliers/prerender/{cat}/{state}/{slug}'

            if prerender_path:
                logger.info(f"Bot detected ({ua[:60]}) — serving prerender: {path} → {prerender_path}")
                try:
                    # Fetch the prerendered HTML from our own backend
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(
                            f"http://127.0.0.1:8001{prerender_path}",
                            timeout=10
                        )
                        if resp.status_code == 200:
                            return HTMLResponse(
                                content=resp.text,
                                status_code=200,
                                headers={'X-Prerender': 'true'}
                            )
                except Exception as e:
                    logger.warning(f"Prerender fetch failed for {path}: {e}")

        return await call_next(request)
