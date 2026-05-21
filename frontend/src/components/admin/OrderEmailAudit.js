import { useEffect, useState } from "react";
import { Mail, CheckCircle2, XCircle, AlertTriangle, Eye, Loader2, X } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const KIND_LABEL = {
  // public-side order emails
  order_sample_customer: "Customer confirmation",
  order_bulk_customer: "Customer confirmation",
  order_sample_admin: "Locofast admin notification",
  order_bulk_admin: "Locofast admin notification",
  order_sample_seller: "Vendor dispatch alert",
  order_bulk_seller: "Vendor dispatch alert",
  order_sample_bundle: "Order email batch",
  order_bulk_bundle: "Order email batch",
  // brand-portal order emails
  brand_order_sample_buyer: "Brand buyer confirmation",
  brand_order_bulk_buyer: "Brand buyer confirmation",
  brand_order_sample_admins: "Brand admins (visibility)",
  brand_order_bulk_admins: "Brand admins (visibility)",
  brand_order_sample_sellers: "Vendor dispatch alert",
  brand_order_bulk_sellers: "Vendor dispatch alert",
  brand_order_sample_ops: "Locofast ops handoff",
  brand_order_bulk_ops: "Locofast ops handoff",
};

const StatusPill = ({ status }) => {
  const map = {
    sent: { bg: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Sent" },
    failed: { bg: "bg-red-100 text-red-700", icon: XCircle, label: "Failed" },
    skipped: { bg: "bg-amber-100 text-amber-700", icon: AlertTriangle, label: "Skipped" },
  };
  const cfg = map[status] || map.skipped;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
};

const OrderEmailAudit = ({ orderId, orderNumber }) => {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");
  const [openLog, setOpenLog] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    const token = localStorage.getItem("locofast_token");
    fetch(`${API}/api/email/admin/logs?order_id=${encodeURIComponent(orderId)}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setLogs)
      .catch((e) => setError(e.message));
  }, [orderId]);

  const viewBody = async (log) => {
    const token = localStorage.getItem("locofast_token");
    try {
      const r = await fetch(`${API}/api/email/admin/logs/${log.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed to load");
      setOpenLog(d);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div data-testid="order-email-audit">
      <h3 className="font-medium mb-3 flex items-center gap-2">
        <Mail size={16} /> Email Audit Trail
        {logs && <span className="text-xs text-gray-500 font-normal">({logs.length} {logs.length === 1 ? "email" : "emails"})</span>}
      </h3>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {logs === null ? (
        <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : logs.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
          No emails logged yet for {orderNumber}. Logs are recorded from this point forward — older orders won't have entries.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {logs.map((log) => (
            <div key={log.id} className="p-3 flex items-start gap-3 text-sm" data-testid={`email-log-${log.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 truncate">{KIND_LABEL[log.kind] || log.kind}</span>
                  <StatusPill status={log.status} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate" title={log.subject}>{log.subject}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  To:{" "}
                  {(log.recipients || []).length === 0 ? (
                    <span className="italic">— no recipient resolved —</span>
                  ) : (
                    log.recipients.map((r) => (
                      <span key={r} className="font-mono mr-1.5">{r}</span>
                    ))
                  )}
                  <span className="text-gray-400 ml-2">{new Date(log.created_at).toLocaleString()}</span>
                </p>
                {log.error && <p className="text-[11px] text-red-600 mt-1">Error: {log.error}</p>}
              </div>
              <button
                onClick={() => viewBody(log)}
                className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                title="View email body"
                data-testid={`view-email-body-${log.id}`}
              >
                <Eye size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {openLog && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setOpenLog(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="email-body-modal">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{KIND_LABEL[openLog.kind] || openLog.kind} · {new Date(openLog.created_at).toLocaleString()}</p>
                <h4 className="text-sm font-semibold text-gray-900 truncate">{openLog.subject}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">To: {(openLog.recipients || []).join(", ")}</p>
              </div>
              <button onClick={() => setOpenLog(null)} className="text-gray-400 hover:text-gray-700 p-1"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50">
              {openLog.html ? (
                <iframe
                  title="Email body"
                  srcDoc={openLog.html}
                  className="w-full h-[60vh] bg-white border border-gray-200 rounded"
                  sandbox=""
                />
              ) : (
                <p className="p-4 text-xs text-gray-500">No HTML body stored for this log entry.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderEmailAudit;
