/**
 * Mobile wishlist detail — `/m/wishlists/:id`
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Heart, ArrowLeft, Pencil, Share2, Copy, EyeOff, Trash2, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import {
  getWishlist, updateWishlist, shareWishlist, removeFromWishlist,
} from "../../lib/api";

const slug = (f) => f.slug || f.id;
const cover = (f) => (f.images && f.images[0]) || "";
const priceOf = (f) => Number(f.rate_per_meter || f.price_per_meter || 0);

export default function MWishlistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, isLoggedIn, loading: authLoading } = useCustomerAuth();
  const [wl, setWl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { navigate(`/m/login?next=/m/wishlists/${id}`); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, id]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await getWishlist(token, id);
      setWl(r.data); setNewName(r.data.name);
    } catch {
      toast.error("Not found"); navigate("/m/wishlists");
    }
    setLoading(false);
  };

  const handleRename = async () => {
    const name = newName.trim();
    if (!name || name === wl.name) { setEditing(false); return; }
    setBusy(true);
    try { await updateWishlist(token, id, { name }); setEditing(false); refresh(); }
    catch { toast.error("Failed"); }
    setBusy(false);
  };

  const handleShare = async (regenerate = false) => {
    setBusy(true);
    try {
      const r = await shareWishlist(token, id, regenerate);
      const url = `${window.location.origin}/wishlist/${r.data.share_token}`;
      try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
      catch { toast.success("Link ready"); }
      refresh();
    } catch { toast.error("Failed"); }
    setBusy(false);
  };

  const handleRevoke = async () => {
    if (!window.confirm("Stop sharing? Existing link will stop working.")) return;
    setBusy(true);
    try { await updateWishlist(token, id, { is_public: false }); refresh(); }
    catch { toast.error("Failed"); }
    setBusy(false);
  };

  const handleCopy = async () => {
    if (!wl?.share_token) return;
    const url = `${window.location.origin}/wishlist/${wl.share_token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  const handleRemove = async (fid) => {
    setBusy(true);
    try { await removeFromWishlist(token, id, fid); refresh(); }
    catch { toast.error("Failed"); }
    setBusy(false);
  };

  if (loading || !wl) {
    return <div className="m-page" style={{ textAlign: "center", padding: 32 }}><span className="m-spinner" /></div>;
  }

  return (
    <div className="m-page" data-testid="m-wishlist-detail-page">
      <Link to="/m/wishlists" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--m-ink-sub)", textDecoration: "none", marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back
      </Link>

      {/* Header */}
      <div style={{ background: "white", border: "1px solid var(--m-border)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              className="m-input"
              style={{ flex: 1, fontSize: 18, fontWeight: 700 }}
              autoFocus
              data-testid="m-wishlist-rename-input"
            />
            <button onClick={handleRename} disabled={busy} className="m-btn m-btn-primary" style={{ padding: "0 12px" }} data-testid="m-wishlist-rename-save">Save</button>
          </div>
        ) : (
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--m-ink)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Heart size={18} color="#E11D48" /> {wl.name}
            <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "#9CA3AF", padding: 0 }} data-testid="m-wishlist-rename-btn">
              <Pencil size={14} />
            </button>
          </h1>
        )}
        <p style={{ fontSize: 11, color: "var(--m-ink-sub)", margin: "4px 0 12px" }}>
          {wl.fabric_count} {wl.fabric_count === 1 ? "fabric" : "fabrics"}
          {wl.is_public && <span style={{ marginLeft: 8, color: "#10B981" }}>· Public link active</span>}
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!wl.is_public ? (
            <button
              onClick={() => handleShare(false)}
              disabled={busy || wl.fabric_count === 0}
              className="m-btn m-btn-primary"
              data-testid="m-wishlist-share-btn"
            >
              <Share2 size={14} /> Share
            </button>
          ) : (
            <>
              <button onClick={handleCopy} className="m-btn" data-testid="m-wishlist-copy-link"><Copy size={14} /> Copy link</button>
              <button onClick={() => handleShare(true)} className="m-btn" title="Regenerate"><RefreshCcw size={14} /></button>
              <button onClick={handleRevoke} className="m-btn" style={{ color: "#DC2626", borderColor: "#FCA5A5" }} data-testid="m-wishlist-revoke-btn">
                <EyeOff size={14} /> Stop
              </button>
            </>
          )}
        </div>

        {wl.is_public && wl.share_token && (
          <div style={{ marginTop: 10, padding: 10, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, fontSize: 11, color: "#065F46", wordBreak: "break-all" }} data-testid="m-wishlist-share-url">
            {`${window.location.origin}/wishlist/${wl.share_token}`}
          </div>
        )}
      </div>

      {/* Items */}
      {wl.items.length === 0 ? (
        <div style={{ background: "white", border: "1px dashed var(--m-border-2)", borderRadius: 12, padding: 28, textAlign: "center" }}>
          <Heart size={28} color="#D1D5DB" style={{ margin: "0 auto 6px" }} />
          <p style={{ fontSize: 13, color: "var(--m-ink-sub)" }}>No fabrics saved.</p>
          <Link to="/m/catalog" style={{ color: "#E11D48", fontSize: 12 }}>Browse fabrics →</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} data-testid="m-wishlist-items">
          {wl.items.map((f) => (
            <div key={f.id} style={{ background: "white", border: "1px solid var(--m-border)", borderRadius: 10, overflow: "hidden", position: "relative" }}>
              <Link to={`/m/fabric/${slug(f)}`} style={{ display: "block" }}>
                {cover(f) ? (
                  <img src={cover(f)} alt={f.name} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1/1", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Heart size={22} color="#D1D5DB" />
                  </div>
                )}
              </Link>
              <button
                onClick={() => handleRemove(f.id)}
                style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, background: "rgba(255,255,255,0.95)", border: "none", color: "#DC2626", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
                data-testid={`m-wishlist-remove-${f.id}`}
              >
                <Trash2 size={12} />
              </button>
              <div style={{ padding: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--m-ink)", margin: 0, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.name}</p>
                {priceOf(f) > 0 && <p style={{ fontSize: 11, fontWeight: 700, color: "#E11D48", margin: "4px 0 0" }}>₹{priceOf(f).toLocaleString("en-IN")}/m</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
