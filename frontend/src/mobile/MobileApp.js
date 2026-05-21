import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import MobileLayout from "./MobileLayout";
import "./theme.css";

const MHome = lazy(() => import("./pages/MHome"));
const MCatalog = lazy(() => import("./pages/MCatalog"));
const MRFQ = lazy(() => import("./pages/MRFQ"));
const MOrders = lazy(() => import("./pages/MOrders"));
const MAccount = lazy(() => import("./pages/MAccount"));
const MFabricDetail = lazy(() => import("./pages/MFabricDetail"));
const MLogin = lazy(() => import("./pages/MLogin"));
const MCheckout = lazy(() => import("./pages/MCheckout"));
const MOrderDetail = lazy(() => import("./pages/MOrderDetail"));
const MNotifications = lazy(() => import("./pages/MNotifications"));
const MRfqDetail = lazy(() => import("./pages/MRfqDetail"));
const MOrderConfirmation = lazy(() => import("./pages/MOrderConfirmation"));
const MInventory = lazy(() => import("./pages/MInventory"));
const MCollections = lazy(() => import("./pages/MCollections"));
const MCollectionDetail = lazy(() => import("./pages/MCollectionDetail"));
const MQueries = lazy(() => import("./pages/MQueries"));

const MobileLoader = () => (
  <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div className="m-spinner" />
  </div>
);

export default function MobileApp() {
  return (
    <Suspense fallback={<div className="m-app"><MobileLoader /></div>}>
      <Routes>
        <Route element={<MobileLayout />}>
          <Route index element={<MHome />} />
          <Route path="catalog" element={<MCatalog />} />
          <Route path="fabric/:slugOrId" element={<MFabricDetail />} />
          <Route path="rfq" element={<MRFQ />} />
          <Route path="orders" element={<MOrders />} />
          <Route path="orders/:orderId" element={<MOrderDetail />} />
          <Route path="account" element={<MAccount />} />
          <Route path="login" element={<MLogin />} />
          <Route path="checkout" element={<MCheckout />} />
          <Route path="notifications" element={<MNotifications />} />
          <Route path="rfq/:rfqId" element={<MRfqDetail />} />
          <Route path="order-confirmation/:orderNumber" element={<MOrderConfirmation />} />
          <Route path="inventory" element={<MInventory />} />
          <Route path="collections" element={<MCollections />} />
          <Route path="collections/:id" element={<MCollectionDetail />} />
          <Route path="queries" element={<MQueries />} />
          <Route path="*" element={<Navigate to="/m" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
