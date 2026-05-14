/**
 * MLedger — Mobile Credit & Ledger page.
 * Mirrors desktop /account?tab=ledger. Pulls the same unified payload
 * via GET /api/credit-ledger/by-gstin/{gstin}.
 *
 * Architectural rule (per /app/frontend/src/mobile/README.md):
 *   NEVER reuse src/components for mobile. We mount a mobile-styled
 *   wrapper that internally renders the shared <CreditLedgerView/>
 *   component because that one is presentation-only (no chrome).
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import CreditLedgerView from "../../components/customer/CreditLedgerView";

export default function MLedger() {
  const navigate = useNavigate();
  const { customer, isLoggedIn } = useCustomerAuth();

  if (!isLoggedIn) {
    return (
      <div className="m-page" style={{ padding: 20 }}>
        <div className="m-card" style={{ padding: 18, textAlign: "center" }} data-testid="m-ledger-signin-required">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sign in to view your ledger</h3>
          <button onClick={() => navigate("/m/login")} className="m-btn m-btn-primary" style={{ marginTop: 12, width: "100%" }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m-page" style={{ paddingBottom: 24 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--m-bg, #fff)", borderBottom: "1px solid var(--m-border, #e5e7eb)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} aria-label="Back" data-testid="m-ledger-back" style={{ border: "none", background: "transparent", padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Credit & Ledger</h1>
      </header>
      <div style={{ padding: 12 }}>
        <CreditLedgerView gstin={customer?.gstin || ""} clientName={customer?.company || customer?.name || ""} dense />
      </div>
    </div>
  );
}
