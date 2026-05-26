import { useEffect, useState, useRef } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

/**
 * Bell icon + dropdown feed of in-app notifications.
 *
 * Props:
 *   audience: "admin" | "vendor"  — which endpoint group to hit.
 *
 * Polls every 30s for new notifications. Click an item to mark-read
 * and navigate to its `link`. The dropdown also has a "Mark all read"
 * shortcut.
 */
const NotificationBell = ({ audience }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const base = audience === "admin" ? "/notifications/admin" : "/notifications/vendor";

  const load = async () => {
    try {
      const { data } = await api.get(base, { params: { limit: 20 } });
      setItems(data.items || []);
      setUnread(data.unread_count || 0);
    } catch { /* ignore — likely 401 during logout */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onItemClick = async (n) => {
    try { await api.post(`${base}/${n.id}/read`); } catch { /* ignore */ }
    setOpen(false);
    if (n.link) navigate(n.link);
    load();
  };

  const onMarkAllRead = async () => {
    try { await api.post(`${base}/mark-all-read`); } catch { /* ignore */ }
    load();
  };

  return (
    <div className="relative" ref={dropdownRef} data-testid={`notif-bell-${audience}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center px-1" data-testid="notif-unread-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[380px] bg-white shadow-lg rounded-xl border border-gray-200 z-50" data-testid="notif-dropdown">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button onClick={onMarkAllRead} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1" data-testid="notif-mark-all-read">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-gray-400">No notifications yet.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${n.read ? "opacity-60" : ""}`}
                  data-testid={`notif-item-${n.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? "bg-gray-300" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {n.read && <Check size={12} className="text-gray-300 mt-1" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
