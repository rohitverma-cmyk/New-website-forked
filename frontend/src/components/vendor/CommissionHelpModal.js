import { useEffect, useState } from "react";
import { X, Check, Info } from "lucide-react";
import api from "../../lib/api";

/**
 * Shows the platform-commission rule hierarchy that applies to a vendor's
 * fabrics. Pulls the live rule set and marks which one is taking effect.
 *
 * Props
 *   open, onClose — dialog state
 *   sellerId      — vendor ID (for vendor-override matching)
 *   categoryName  — category string (for category-rule matching)
 *   appliedPct    — the resolved % (for highlighting which row is active)
 */
const CommissionHelpModal = ({ open, onClose, sellerId, categoryName, appliedPct }) => {
  const [rules, setRules] = useState([]);
  const [defaultPct, setDefaultPct] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      api.get("/commission/rules").catch(() => ({ data: [] })),
      api.get("/commission/default").catch(() => ({ data: {} })),
    ])
      .then(([r, d]) => {
        setRules((r.data || []).filter((x) => x.is_active));
        setDefaultPct(d.data?.default_pct ?? null);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const vendorRule = rules.find(
    (r) => r.rule_type === "vendor" && r.vendor_id === sellerId
  );
  const categoryRule = rules.find(
    (r) =>
      r.rule_type === "category" &&
      (r.category_name || "").toLowerCase() === (categoryName || "").toLowerCase()
  );
  const slabRules = rules.filter((r) => r.rule_type === "cart_value" || r.rule_type === "meterage");
  const sourceRules = rules.filter((r) => r.rule_type === "source");

  // Decide which row is the one actually being used
  let activeKey = "default";
  if (vendorRule) activeKey = "vendor";
  else if (categoryRule) activeKey = "category";
  else if (slabRules.length) activeKey = "slab";
  else if (sourceRules.length) activeKey = "source";

  const rows = [
    {
      key: "vendor",
      label: "Vendor-specific override",
      hint: "Custom % agreed with you as a seller (highest priority)",
      value: vendorRule ? `${vendorRule.commission_pct}%` : "Not configured",
      hasRule: !!vendorRule,
    },
    {
      key: "category",
      label: `Category rule${categoryName ? ` · ${categoryName}` : ""}`,
      hint: "Applies to every fabric in this category",
      value: categoryRule ? `${categoryRule.commission_pct}%` : "Not configured",
      hasRule: !!categoryRule,
    },
    {
      key: "slab",
      label: "Volume / cart-value slab",
      hint: "Tiered rates by cart subtotal or total metres ordered",
      value: slabRules.length
        ? `${Math.min(...slabRules.map((r) => r.commission_pct))}% – ${Math.max(
            ...slabRules.map((r) => r.commission_pct)
          )}%`
        : "Not configured",
      hasRule: slabRules.length > 0,
    },
    {
      key: "source",
      label: "Source (inventory vs RFQ)",
      hint: "Separate rate for inventory purchases vs RFQ-driven orders",
      value: sourceRules.length ? sourceRules.map((r) => `${r.source}: ${r.commission_pct}%`).join(" · ") : "Not configured",
      hasRule: sourceRules.length > 0,
    },
    {
      key: "default",
      label: "Platform default",
      hint: "Applies when no other rule matches",
      value: defaultPct != null ? `${defaultPct}%` : "—",
      hasRule: defaultPct != null,
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="commission-help-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 bg-orange-100 rounded-lg p-2">
              <Info size={18} className="text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">How is this calculated?</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Commission is picked from the first rule below that matches.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="close-commission-help">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-gray-500">Loading rules…</p>
          ) : (
            <ol className="space-y-3">
              {rows.map((row, idx) => {
                const active = row.key === activeKey && row.hasRule;
                return (
                  <li
                    key={row.key}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                      active
                        ? "border-emerald-300 bg-emerald-50"
                        : row.hasRule
                        ? "border-gray-200 bg-white"
                        : "border-gray-100 bg-gray-50 opacity-60"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-xs font-bold ${
                        active
                          ? "bg-emerald-500 text-white"
                          : row.hasRule
                          ? "bg-white border-2 border-gray-300 text-gray-500"
                          : "bg-white border-2 border-dashed border-gray-300 text-gray-400"
                      }`}
                    >
                      {active ? <Check size={14} /> : idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{row.hint}</p>
                        </div>
                        <span
                          className={`text-xs font-semibold whitespace-nowrap ${
                            active ? "text-emerald-700" : "text-gray-700"
                          }`}
                        >
                          {row.value}
                        </span>
                      </div>
                      {active && (
                        <p className="text-[11px] text-emerald-700 mt-1.5 font-medium">
                          ✓ Currently applies to this fabric
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-5 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
            <b>You're currently paying {appliedPct ?? "—"}%.</b> The exact amount is
            deducted at the time of sale; your payout after commission is shown next to
            every fabric and every order. For any questions, reach out to your account
            manager.
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionHelpModal;
