import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import TopAppBar from "./components/TopAppBar";
import BottomTabs from "./components/BottomTabs";
import InstallPrompt from "./components/InstallPrompt";
import "./theme.css";

// Mobile-only routes don't need top bar / tabs (e.g. checkout flow, fabric detail)
const HIDE_TOPBAR = [
  "/m/login",
  "/m/fabric/",
];
// Pages that have their own sticky bottom action bar — hiding the tab bar
// avoids two stacked bottom bars and gives the page full vertical real-estate.
const HIDE_TABS = [
  "/m/login",
  "/m/checkout",
  "/m/fabric/",
  "/m/order-confirmation/",
  "/m/orders/", // /m/orders/:id  (the listing /m/orders keeps tabs)
  "/m/rfq/",    // /m/rfq/:id     (the listing /m/rfq keeps tabs)
];

export default function MobileLayout() {
  const location = useLocation();

  useEffect(() => {
    // Apply mobile theme color to the address bar when in /m/*
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta ? meta.getAttribute('content') : null;
    if (meta) meta.setAttribute('content', '#FFFFFF');
    return () => {
      if (meta && prev) meta.setAttribute('content', prev);
    };
  }, []);

  // Hide tabs if route matches any prefix AND has additional path segments.
  // (A bare `/m/orders` listing keeps the tabs; `/m/orders/<id>` hides them.)
  const hideTopbar = HIDE_TOPBAR.some((p) => location.pathname.startsWith(p));
  const hideTabs = HIDE_TABS.some((p) => {
    if (p.endsWith("/")) {
      // prefix rule — must have a trailing segment beyond the prefix
      return location.pathname.startsWith(p) && location.pathname.length > p.length;
    }
    return location.pathname === p || location.pathname.startsWith(p + "/");
  });

  return (
    <div className="m-app">
      {!hideTopbar && <TopAppBar />}
      <main className="m-screen" style={hideTopbar ? { paddingTop: 0 } : undefined}>
        <Outlet />
      </main>
      {!hideTabs && <BottomTabs />}
      <InstallPrompt />
    </div>
  );
}
