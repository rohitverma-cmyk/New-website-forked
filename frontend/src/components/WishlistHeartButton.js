/**
 * Reusable wishlist heart button.
 *
 * Pops a small picker over the heart with the customer's wishlists +
 * an inline "Create new" row. Tap a wishlist → fabric is added (or removed
 * if already in it). Anonymous customers are routed to /login with a
 * post-login redirect.
 *
 * Used on:
 *  - Desktop FabricDetailPage (large heart)
 *  - Mobile FabricCard / MFabricDetail (small heart overlay)
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Heart, Plus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import CustomerLoginModal from "./CustomerLoginModal";
import {
  listWishlists, createWishlist, addToWishlist, removeFromWishlist,
} from "../lib/api";

export default function WishlistHeartButton({
  fabricId,
  variant = "default",      // "default" | "overlay" (rounded chip over images) | "icon" (bare)
  size = 18,
  className = "",
}) {
  const { token, isLoggedIn } = useCustomerAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState([]);
  const [newName, setNewName] = useState("");
  const ref = useRef(null);

  // Mobile surfaces (/m/*) use their own login page; desktop uses an in-page modal.
  const isMobileSurface = loc.pathname.startsWith("/m");

  // Re-open the picker automatically once the customer logs in via the modal.
  useEffect(() => {
    if (isLoggedIn && showLogin) {
      setShowLogin(false);
      setOpen(true);
    }
  }, [isLoggedIn, showLogin]);

  // Derived: is this fabric already in any of my wishlists?
  const containedIn = lists.filter((w) => (w.fabric_ids || []).includes(fabricId));
  const inAny = containedIn.length > 0;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refreshLists = async () => {
    setLoading(true);
    try {
      const r = await listWishlists(token);
      setLists(r.data || []);
    } catch {
      toast.error("Could not load your wishlists");
    }
    setLoading(false);
  };

  const openPicker = async () => {
    if (!isLoggedIn) {
      if (isMobileSurface) {
        // Mobile has a dedicated login page — preserve the return path.
        navigate(`/m/login?next=${encodeURIComponent(loc.pathname + loc.search)}`);
      } else {
        // Desktop uses an in-page modal (there is no /login route).
        setShowLogin(true);
      }
      return;
    }
    setOpen(true);
    if (lists.length === 0) {
      await refreshLists();
    }
  };

  const handleToggle = async (w) => {
    setBusy(true);
    try {
      const has = (w.fabric_ids || []).includes(fabricId);
      if (has) {
        await removeFromWishlist(token, w.id, fabricId);
        toast.success(`Removed from "${w.name}"`);
      } else {
        await addToWishlist(token, w.id, fabricId);
        toast.success(`Saved to "${w.name}"`);
      }
      // Optimistic refresh
      const r = await listWishlists(token);
      setLists(r.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update wishlist");
    }
    setBusy(false);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Give your wishlist a name"); return; }
    setBusy(true);
    try {
      const r = await createWishlist(token, name);
      await addToWishlist(token, r.data.id, fabricId);
      toast.success(`Created "${name}" and saved this fabric`);
      const r2 = await listWishlists(token);
      setLists(r2.data || []);
      setNewName("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create wishlist");
    }
    setBusy(false);
  };

  // Style modes
  const heartCls =
    variant === "overlay"
      ? "absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center hover:scale-105 transition"
      : variant === "icon"
      ? "p-1 hover:opacity-80 transition"
      : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-rose-300 text-sm font-medium";
  const heartFill = inAny ? "#E11D48" : "none";
  const heartStroke = inAny ? "#E11D48" : "currentColor";

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Login modal — only mounted when needed; closes itself on success. */}
      {showLogin && (
        <CustomerLoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      )}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPicker(); }}
        className={heartCls}
        title={inAny ? "In wishlist" : "Save to wishlist"}
        aria-label={inAny ? "In wishlist" : "Save to wishlist"}
        data-testid={`wishlist-heart-${fabricId}`}
        data-in-wishlist={inAny ? "true" : "false"}
      >
        <Heart size={size} fill={heartFill} stroke={heartStroke} strokeWidth={2} />
        {variant === "default" && <span>{inAny ? "Saved" : "Save"}</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3"
          onClick={(e) => e.stopPropagation()}
          data-testid="wishlist-picker"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Save to wishlist</h4>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-gray-400">
              <Loader2 size={16} className="animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {lists.length === 0 && (
                <p className="text-xs text-gray-500 py-2">You don't have any wishlists yet. Create one below.</p>
              )}
              {lists.map((w) => {
                const has = (w.fabric_ids || []).includes(fabricId);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleToggle(w)}
                    disabled={busy}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-left text-sm"
                    data-testid={`wishlist-pick-${w.id}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${has ? "bg-rose-500 border-rose-500" : "border-gray-300"}`}>
                        {has && <Check size={11} stroke="white" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{w.name}</span>
                    </span>
                    <span className="text-[11px] text-gray-400">{w.fabric_count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="New wishlist name…"
                maxLength={80}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                data-testid="wishlist-new-name-input"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy || !newName.trim()}
                className="px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-sm disabled:opacity-50 inline-flex items-center gap-1"
                data-testid="wishlist-create-btn"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
