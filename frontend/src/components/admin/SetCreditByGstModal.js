// Single-entry "Set Credit Limit by GST" modal.
//
// UX flow:
//   1. Admin types a GSTIN (uppercased + space-stripped live).
//   2. As soon as length === 15 we look it up:
//        a) Client-side first (existingWallets prop — already loaded by the
//           parent for the table view).
//        b) Server fallback in case the client cache is stale.
//   3. If a wallet is found, the form pre-fills with the existing
//      company/email/lender/period and shows the current limit + used.
//      A "Replace" / "Top-up" mode toggle appears so accounts can choose
//      whether to overwrite the cap or extend it.
//   4. If not found, the form switches to "Create new wallet" mode and
//      asks for the metadata (company/email/lender/period) up front.
//   5. Submit hits POST /api/orders/credit/wallets/upsert with the
//      operator password (0905) — same gate as the per-row edit modal.
//
// This is a cmd-line-style power tool — minimal UI, all state lives in
// this component, no global store, no router. Imported by AdminOrders.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Search, AlertCircle, Wallet, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { upsertCreditWallet, lookupCreditWalletByGst } from "../../lib/api";

const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const SetCreditByGstModal = ({ open, onClose, onSuccess, existingWallets = [] }) => {
  const [gstInput, setGstInput] = useState("");
  const [lookupState, setLookupState] = useState({ status: "idle", wallet: null });
  // status ∈ idle | searching | found | not_found | error

  const [creditLimit, setCreditLimit] = useState("");
  const [mode, setMode] = useState("replace"); // replace | topup (only when wallet exists)
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [lender, setLender] = useState("");
  const [period, setPeriod] = useState("30");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset everything when modal opens/closes
  useEffect(() => {
    if (open) {
      setGstInput("");
      setLookupState({ status: "idle", wallet: null });
      setCreditLimit("");
      setMode("replace");
      setCompany("");
      setContactName("");
      setEmail("");
      setLender("");
      setPeriod("30");
      setPassword("");
    }
  }, [open]);

  // Normalize input: uppercase, no spaces
  const onGstChange = (raw) => {
    const cleaned = String(raw || "").toUpperCase().replace(/\s+/g, "");
    setGstInput(cleaned);
    if (cleaned.length !== 15) {
      setLookupState({ status: "idle", wallet: null });
    }
  };

  // Lookup whenever GSTIN reaches 15 chars
  useEffect(() => {
    if (gstInput.length !== 15) return;
    let cancelled = false;
    const run = async () => {
      setLookupState({ status: "searching", wallet: null });
      // Pass 1: client-side cache
      const local = existingWallets.find((w) => (w.gst_number || "").toUpperCase() === gstInput);
      if (local) {
        if (cancelled) return;
        setLookupState({ status: "found", wallet: local });
        return;
      }
      // Pass 2: server (cache may be stale)
      try {
        const res = await lookupCreditWalletByGst(gstInput);
        if (cancelled) return;
        if (res.data?.found) {
          setLookupState({ status: "found", wallet: res.data.wallet });
        } else {
          setLookupState({ status: "not_found", wallet: null });
        }
      } catch {
        if (!cancelled) setLookupState({ status: "error", wallet: null });
      }
    };
    run();
    return () => { cancelled = true; };
  }, [gstInput, existingWallets]);

  // When a wallet is found, pre-fill the form so admin doesn't retype the metadata.
  useEffect(() => {
    if (lookupState.status === "found" && lookupState.wallet) {
      const w = lookupState.wallet;
      setCompany(w.company || "");
      setContactName(w.name || "");
      setEmail(w.email || "");
      setLender(w.lender || "");
      setPeriod(String(w.credit_period_days || 30));
      // Show the existing limit as a hint — but don't auto-overwrite, since
      // the whole point of opening the modal is to change it.
      setCreditLimit("");
    }
  }, [lookupState.status, lookupState.wallet]);

  const isExisting = lookupState.status === "found";
  const isNew = lookupState.status === "not_found";
  const canSubmit = useMemo(() => {
    if (gstInput.length !== 15) return false;
    if (!(isExisting || isNew)) return false; // still searching / error
    const limitNum = parseFloat(creditLimit);
    if (Number.isNaN(limitNum) || limitNum < 0) return false;
    if (!password.trim()) return false;
    if (isNew && !company.trim()) return false;
    return true;
  }, [gstInput, isExisting, isNew, creditLimit, password, company]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        password: password.trim(),
        gst_number: gstInput,
        credit_limit: parseFloat(creditLimit),
        mode: isExisting ? mode : "replace",
        company: company.trim(),
        name: contactName.trim(),
        email: email.trim().toLowerCase(),
        lender: lender.trim(),
        credit_period_days: parseInt(period, 10) || 30,
      };
      const res = await upsertCreditWallet(payload);
      const d = res.data || {};
      const verb = d.created ? "created" : (mode === "topup" ? "topped up" : "updated");
      toast.success(`Credit wallet ${verb} for ${gstInput}`);
      onSuccess?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update credit");
    }
    setSubmitting(false);
  };

  if (!open) return null;

  const existing = lookupState.wallet;
  const used = existing ? (existing.credit_limit || 0) - (existing.balance || 0) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="set-credit-by-gst-modal"
    >
      <div
        className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Wallet size={18} className="text-emerald-600" />
              Set Credit Limit by GST
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Search by GSTIN. If the customer is registered, you'll update their existing limit;
              otherwise we'll create a new credit wallet.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-gray-400 hover:text-gray-700" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* GST input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">GSTIN *</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={gstInput}
                onChange={(e) => onGstChange(e.target.value)}
                placeholder="e.g. 27AABCB1234C1Z5"
                maxLength={15}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg font-mono text-sm tracking-wider uppercase focus:border-blue-500 focus:outline-none"
                data-testid="set-credit-gst-input"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{gstInput.length}/15 characters</p>
          </div>

          {/* Lookup result */}
          {gstInput.length === 15 && (
            <>
              {lookupState.status === "searching" && (
                <div className="flex items-center gap-2 text-sm text-gray-500" data-testid="set-credit-searching">
                  <Loader2 size={14} className="animate-spin" /> Looking up customer…
                </div>
              )}

              {lookupState.status === "found" && existing && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1.5 text-sm" data-testid="set-credit-existing-card">
                  <p className="font-semibold text-blue-900 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Customer registered — updating existing wallet
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-blue-800 mt-1">
                    <div><span className="text-blue-600">Company:</span> {existing.company || "—"}</div>
                    <div><span className="text-blue-600">Contact:</span> {existing.name || "—"}</div>
                    <div><span className="text-blue-600">Email:</span> {existing.email || "—"}</div>
                    <div><span className="text-blue-600">Lender:</span> {existing.lender || "Direct"}</div>
                    <div><span className="text-blue-600">Current limit:</span> <strong>{fmtINR(existing.credit_limit)}</strong></div>
                    <div><span className="text-blue-600">Available:</span> <strong>{fmtINR(existing.balance)}</strong></div>
                    <div><span className="text-blue-600">Used:</span> {fmtINR(used)}</div>
                    <div><span className="text-blue-600">Period:</span> {existing.credit_period_days || 30}d</div>
                  </div>
                </div>
              )}

              {lookupState.status === "not_found" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm flex items-start gap-2" data-testid="set-credit-new-card">
                  <Plus size={14} className="text-amber-700 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">New customer — wallet will be created</p>
                    <p className="text-[12px] text-amber-800 mt-0.5">No existing credit line for this GSTIN. Fill the details below to onboard them.</p>
                  </div>
                </div>
              )}

              {lookupState.status === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-600" />
                  <span className="text-red-700">Lookup failed. You can still proceed — submit will create or update based on backend state.</span>
                </div>
              )}
            </>
          )}

          {/* Form (visible only after lookup completes) */}
          {(isExisting || isNew) && (
            <>
              {/* Mode toggle — only when wallet exists */}
              {isExisting && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">How should the new amount apply?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer ${mode === "replace" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="set-credit-mode"
                          value="replace"
                          checked={mode === "replace"}
                          onChange={() => setMode("replace")}
                          data-testid="set-credit-mode-replace"
                        />
                        <span className="text-sm font-medium">Replace</span>
                      </div>
                      <p className="text-[11px] text-gray-500 ml-5">Overwrites limit; balance reset to new limit.</p>
                    </label>
                    <label className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer ${mode === "topup" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="set-credit-mode"
                          value="topup"
                          checked={mode === "topup"}
                          onChange={() => setMode("topup")}
                          data-testid="set-credit-mode-topup"
                        />
                        <span className="text-sm font-medium">Top-up</span>
                      </div>
                      <p className="text-[11px] text-gray-500 ml-5">Adds amount to existing limit & balance (used credit preserved).</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Credit limit input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {isExisting
                    ? (mode === "topup" ? "Top-up amount (₹) *" : "New credit limit (₹) *")
                    : "Credit limit (₹) *"}
                </label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  data-testid="set-credit-limit-input"
                />
                {isExisting && mode === "topup" && creditLimit && (
                  <p className="text-[11px] text-emerald-700 mt-1">
                    New limit after top-up: <strong>{fmtINR((existing?.credit_limit || 0) + parseFloat(creditLimit || 0))}</strong>
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company {isNew && "*"}</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="Brand / Legal name"
                    data-testid="set-credit-company-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contact name</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Buyer email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="buyer@brand.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lender</label>
                  <input
                    value={lender}
                    onChange={(e) => setLender(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="HDFC Bank / Stride / Direct"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Credit period</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
              </div>

              {/* Password gate */}
              <div className="border-t pt-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Operator password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  data-testid="set-credit-password-input"
                />
                <p className="text-[11px] text-gray-500 mt-1">Same gate as the row-level edit (Accounts ops know this).</p>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 bg-white rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="set-credit-submit-btn"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {isExisting
              ? (mode === "topup" ? "Top up credit" : "Update credit limit")
              : "Create credit wallet"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetCreditByGstModal;
