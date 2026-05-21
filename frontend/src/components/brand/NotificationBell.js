import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BadgeCheck, Loader2, ExternalLink } from "lucide-react";
import { useBrandAuth } from "../../context/BrandAuthContext";

const API = process.env.REACT_APP_BACKEND_URL;
const POLL_MS = 30000;

const timeAgo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const NotificationBell = () => {
  const { token } = useBrandAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  // Poll the lightweight count every 30s
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${API}/api/brand/notifications/unread-count`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (!cancelled) setUnread(d.unread_count || 0);
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [token]);

  // Click-outside to close
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/brand/notifications?limit=10`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setItems(d.notifications || []);
      setUnread(d.unread_count || 0);
    } catch { setItems([]); }
    setLoading(false);
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadList();
  };

  const markRead = async (id) => {
    try {
      await fetch(`${API}/api/brand/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch { /* ignore */ }
  };

  const markAll = async () => {
    try {
      await fetch(`${API}/api/brand/notifications/read-all`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      setUnread(0);
      setItems((cur) => (cur || []).map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  const onClickItem = async (n) => {
    if (!n.read) {
      await markRead(n.id);
      setUnread((c) => Math.max(0, c - 1));
      setItems((cur) => (cur || []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
        title="Notifications"
        data-testid="brand-notif-bell"
      >
        <Bell size={18} className="text-gray-700" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none animate-pulse" data-testid="brand-notif-unread">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[380px] bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden" data-testid="brand-notif-dropdown">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-sm text-gray-900">Notifications</h4>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-emerald-700 hover:underline" data-testid="brand-notif-mark-all">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 size={16} className="animate-spin text-emerald-600" /></div>
            ) : (items || []).length === 0 ? (
              <div className="py-12 px-6 text-center">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-700">All caught up</p>
                <p className="text-xs text-gray-500 mt-0.5">New vendor quotes show up here in real time.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => onClickItem(n)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition ${n.read ? "" : "bg-emerald-50/40"}`}
                    data-testid={`brand-notif-item-${n.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${n.read ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
                        <BadgeCheck size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-snug ${n.read ? "text-gray-700" : "text-gray-900 font-medium"}`}>{n.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</span>
                          {n.url && <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5">View &amp; compare <ExternalLink size={9} /></span>}
                        </div>
                      </div>
                      {!n.read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 mt-1.5" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 px-4 py-2 bg-gray-50">
            <Link to="/enterprise/queries" onClick={() => setOpen(false)} className="text-xs text-emerald-700 hover:underline">
              See all queries →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
