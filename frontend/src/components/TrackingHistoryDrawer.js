/**
 * TrackingHistoryDrawer — vertical timeline of every Shiprocket scan
 * received for a single order.
 *
 * Slides in from the right when the user clicks "Tracking history" on the
 * Order Detail page. Pulls from `GET /api/customer/orders/{id}/tracking`,
 * which is scoped to the logged-in customer (the same auth boundary as the
 * rest of /account).
 *
 * Visual: GitHub-Actions-style vertical rail. Every event is a circle on the
 * rail with a courier-coloured dot and the activity / location / timestamp.
 */
import { useEffect, useState, useCallback } from "react";
import { X, Loader2, Truck, MapPin, CheckCircle, Package, ExternalLink, Clock } from "lucide-react";
import { getOrderTracking } from "../lib/api";
import { useCustomerAuth } from "../context/CustomerAuthContext";

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

// Map our canonical mapped_status → icon + colour
const dotFor = (mapped) => {
  switch (mapped) {
    case "delivered": return { Icon: CheckCircle, dot: "bg-emerald-500", ring: "ring-emerald-100" };
    case "shipped":   return { Icon: Truck,        dot: "bg-blue-500",    ring: "ring-blue-100" };
    case "processing":return { Icon: Package,      dot: "bg-amber-500",   ring: "ring-amber-100" };
    case "cancelled": return { Icon: X,            dot: "bg-red-500",     ring: "ring-red-100" };
    default:          return { Icon: Clock,        dot: "bg-gray-400",    ring: "ring-gray-100" };
  }
};

const TrackingHistoryDrawer = ({ open, onClose, orderId }) => {
  const { token } = useCustomerAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orderId || !token) return;
    setLoading(true);
    setError("");
    try {
      const res = await getOrderTracking(token, orderId);
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load tracking history");
    }
    setLoading(false);
  }, [orderId, token]);

  // Re-fetch every time the drawer opens — events stream in over time.
  useEffect(() => { if (open) load(); }, [open, load]);

  // Lock background scroll when drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const events = data?.events || [];
  const trackingUrl = data?.awb_code
    ? `https://shiprocket.co/tracking/${encodeURIComponent(data.awb_code)}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        data-testid="tracking-drawer-backdrop"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col"
        data-testid="tracking-drawer"
        role="dialog"
        aria-label="Tracking history"
      >
        <header className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Truck size={16} className="text-emerald-600" /> Tracking history
            </h3>
            {data?.awb_code ? (
              <p className="text-xs text-gray-500 mt-0.5">
                AWB <span className="font-mono">{data.awb_code}</span>
                {data.courier_name && <> · {data.courier_name}</>}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">No AWB allocated yet</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1"
            data-testid="tracking-drawer-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}
          {!loading && !error && events.length === 0 && (
            <div className="text-center py-16">
              <Truck size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-700 font-medium">No tracking events yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Updates will appear here automatically as your courier scans the package.
              </p>
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <ol className="relative" data-testid="tracking-events-list">
              {/* The vertical rail. Stops 14px before the bottom dot so the
                  line doesn't extend past the last event. */}
              <span className="absolute left-[14px] top-2 bottom-2 w-px bg-gray-200" aria-hidden="true" />

              {events.map((ev, idx) => {
                const { Icon, dot, ring } = dotFor(ev.mapped_status);
                const isLatest = idx === 0;
                return (
                  <li
                    key={`${ev.event_time}-${idx}`}
                    className="relative pl-10 pb-6 last:pb-0"
                    data-testid={`tracking-event-${idx}`}
                  >
                    <span
                      className={`absolute left-0 top-0 w-7 h-7 rounded-full ${dot} ${ring} ring-4 flex items-center justify-center text-white shadow-sm`}
                    >
                      <Icon size={13} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">
                          {ev.raw_status || ev.activity || "Update"}
                        </p>
                        {isLatest && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Latest
                          </span>
                        )}
                      </div>
                      {ev.activity && ev.activity !== ev.raw_status && (
                        <p className="text-xs text-gray-600 mt-0.5">{ev.activity}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
                        {ev.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={10} /> {ev.location}
                          </span>
                        )}
                        {ev.courier_name && <span>{ev.courier_name}</span>}
                        <span>{formatDate(ev.event_time)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {trackingUrl && (
          <footer className="px-6 py-4 border-t border-gray-100">
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 bg-white border border-emerald-300 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-50 transition"
              data-testid="tracking-drawer-shiprocket-link"
            >
              View on Shiprocket <ExternalLink size={12} />
            </a>
          </footer>
        )}
      </aside>
    </>
  );
};

export default TrackingHistoryDrawer;
