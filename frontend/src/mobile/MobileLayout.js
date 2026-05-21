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
const HIDE_TABS = [
  "/m/login",
  "/m/checkout",
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

  const hideTopbar = HIDE_TOPBAR.some((p) => location.pathname.startsWith(p));
  const hideTabs = HIDE_TABS.some((p) => location.pathname.startsWith(p));

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
