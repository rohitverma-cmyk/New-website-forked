# Mobile PWA — Architecture & Contributor Rules

This folder hosts the **mobile buyer PWA** mounted at `/m/*`. It shares the
single React tree with the desktop site at `/`. Both surfaces live in the
same bundle and use the same router, auth, and API client.

> **Rule of thumb:** "If it represents the user (auth, session, API client)
> — share it. If it represents the surface (theme, layout, mobile-local UI
> state, SW) — isolate it."

---

## File-edit boundaries

| Working on | Edit | Don't touch |
|---|---|---|
| **[MOBILE]** task | `src/mobile/**` + the single `/m/*` route line in `src/App.js` | `src/pages/`, `src/components/` |
| **[WEB]** task | `src/pages/`, `src/components/` | `src/mobile/**` |
| **[BACKEND]** task | `backend/**` | (after change → smoke-test BOTH surfaces) |

The only exception in `src/components/` is `TryMobilePreview.js` — installed
once with the mobile bundle. It's the desktop CTA that opens `/m` in an
iframe preview. Don't move it.

---

## Decision matrix — share vs. isolate

| Concern | Share with web? | Why |
|---|---|---|
| `BrowserRouter` | **Share** | Nested routers break `navigate()`, deep links, and history. |
| `CustomerAuthProvider`, `AuthProvider` | **Share** | Same JWT, same `/api/customer/*` endpoints, same user. Forking → two session stores → login-on-one/logged-out-on-other bugs. |
| `HelmetProvider` | **Share** | One head manager per tree; isolation makes `<title>` tags fight each other. |
| `ConfirmProvider`, `Toaster` | **Share** | Singletons by design. |
| `BrandCartContext` | **Share (mobile ignores it)** | Enterprise-portal scoped; mobile buyer doesn't read or write it. |
| API client (`axios.create`) | **Share** | Same `REACT_APP_BACKEND_URL`, same `/api/*` prefix, same interceptors. |
| shadcn/ui components | **Share** | Prop-styled; import the ones you need. |
| **Theme tokens** (CSS vars) | **Isolate** | Mobile palette differs (orange/navy/cream). Loaded inside `MobileLayout.js` only — never globally. |
| Tailwind utilities | **Share** | Single Tailwind config. Mobile uses utilities + scoped tokens. |
| **Service worker** | **Isolate** | Registered only on `/m/*` (`scope: "/m"`). Desktop must not run a caching SW. |
| **Mobile-only state** (filters, install banner, etc.) | **Isolate (mobile-local)** | Lives inside `MobileApp.js`, never at the top of `App.js`. |
| **Routes** | **Isolate** | Mobile owns one top-level `<Route path="/m/*" />`; nested `<Routes>` inside `MobileApp.js`. |

---

## How it's wired

```
<HelmetProvider>            ┐
<ConfirmProvider>           │
<CustomerAuthProvider>      │  SHARED top-level providers
<AuthProvider>              │  Both surfaces read/write the same state.
<BrandCartProvider>         ┘
  <BrowserRouter>           ← SHARED — single router
    <ScrollToTop />
    <MobileRedirector />    ← auto-redirects phone UA hitting / to /m
    <Routes>
      <Route path="/m/*" element={<MobileApp />} />   ← ISOLATION POINT
      <Route path="/" element={<DesktopHome />} />
      <Route path="/fabrics" element={<FabricsPage />} />
      ...
    </Routes>
    <ConditionalWhatsAppChat />  ← suppressed on /m/*
    <TryMobilePreview />         ← desktop-only CTA
  </BrowserRouter>
</...providers>

Inside MobileApp:
  <MobileLayout>              ← imports theme.css (scoped here)
    <Routes>                  ← nested routes for /m/*
      <Route path="" element={<MHome />} />
      <Route path="catalog" element={<MCatalog />} />
      ...
    </Routes>
  </MobileLayout>
```

---

## What NOT to do (and why)

1. **Don't fork the React tree** for `/m/*` — two routers means broken
   `<Link to="/m/fabric/x">` from desktop, no shared history.
2. **Don't duplicate auth providers.** A logged-in user on `/` must stay
   logged in on `/m`. Two stores = nightmare bugs.
3. **Don't duplicate `HelmetProvider`.** Causes duplicate `<title>` tags
   and SEO regressions.
4. **Don't register the service worker globally.** It must only register
   when `location.pathname.startsWith("/m")`. See `MobileRedirector` in
   `App.js` and `mobile/utils/registerServiceWorker.js`.
5. **Don't import `mobile/theme.css` from `App.js` or any desktop
   component.** It will leak `--mobile-orange`, `--mobile-cream`, etc. into
   the entire site. Only `MobileLayout.js` imports it.

---

## Surface-aware post-login redirects

When sharing auth contexts, **redirect-after-login** must be surface-aware:

```js
// In any post-login navigation logic
const isMobile = location.pathname.startsWith("/m");
navigate(isMobile ? "/m" : "/account", { replace: true });
```

Otherwise a mobile login on `/m/login` could dump the user onto the
desktop `/account` page. `mobile/pages/MLogin.js` handles this locally;
audit any **context-level** `navigate('/...')` calls if you touch auth.

---

## Adding a new mobile page

1. Create `src/mobile/pages/MFooBar.js` (the `M` prefix is convention).
2. Register it in `src/mobile/MobileApp.js` under the nested `<Routes>`:
   ```jsx
   <Route path="foo-bar" element={<MFooBar />} />
   ```
3. If it needs new mobile-local state, create a provider inside
   `src/mobile/` and mount it **inside** `MobileApp.js` — never at the
   top of `App.js`.
4. Use shared API helpers from `src/lib/api.js`. Don't fork an axios
   instance.

---

## Smoke checklist for any change touching shared providers, App.js, or backend

- [ ] `curl $REACT_APP_BACKEND_URL/api/...` returns expected data
- [ ] Screenshot of `/` — desktop unchanged
- [ ] Screenshot of `/m` — mobile unchanged and catalog renders
- [ ] Phone UA hitting `/` → auto-redirects to `/m` (test with `is_mobile=True` Playwright context)
- [ ] After `/m/login`, user lands inside `/m/*` — not on `/account`
