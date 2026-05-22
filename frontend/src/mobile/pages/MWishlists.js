/**
 * Mobile wishlists hub — `/m/wishlists`
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Heart, Plus, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { listWishlists, createWishlist, deleteWishlist } from "../../lib/api";

export default function MWishlists() {
  const { token, isLoggedIn, loading: authLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { navigate("/m/login?next=/m/wishlists"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listWishlists(token);
      setLists(r.data || []);
    } catch {
      toast.error("Failed to load");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await createWishlist(token, name);
      setNewName("");
      navigate(`/m/wishlists/${r.data.id}`);
    } catch (e) {
      toast.error("Failed");
    }
    setCreating(false);
  };

  const handleDelete = async (w) => {
    if (!window.confirm(`Delete "${w.name}"?`)) return;
    try { await deleteWishlist(token, w.id); refresh(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="m-page" data-testid="m-wishlists-page">
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--m-ink)", margin: "16px 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <Heart size={20} color="#E11D48" /> My Wishlists
      </h1>
      <p className="m-caption" style={{ marginBottom: 16 }}>Save fabrics to themed lists. Share via a private link.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. SS26 picks"
          maxLength={80}
          className="m-input"
          style={{ flex: 1 }}
          data-testid="m-wishlists-new-name"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="m-btn m-btn-primary"
          style={{ padding: "0 14px" }}
          data-testid="m-wishlists-create"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> New</>}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <span className="m-spinner" />
        </div>
      ) : lists.length === 0 ? (
        <div style={{ background: "white", border: "1px dashed var(--m-border-2)", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <Heart size={28} color="#D1D5DB" style={{ margin: "0 auto 6px" }} />
          <p style={{ fontSize: 13, color: "var(--m-ink-sub)" }}>No wishlists yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="m-wishlists-list">
          {lists.map((w) => (
            <div key={w.id} style={{ background: "white", border: "1px solid var(--m-border)", borderRadius: 12, display: "flex", alignItems: "center" }}>
              <Link
                to={`/m/wishlists/${w.id}`}
                style={{ flex: 1, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", color: "inherit", textDecoration: "none" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, color: "var(--m-ink)", margin: 0 }}>{w.name}</p>
                  <p style={{ fontSize: 11, color: "var(--m-ink-sub)", margin: "2px 0 0" }}>
                    {w.fabric_count} {w.fabric_count === 1 ? "fabric" : "fabrics"}
                    {w.is_public && <span style={{ marginLeft: 8, color: "#10B981" }}>· Shared</span>}
                  </p>
                </div>
                <ChevronRight size={18} color="#9CA3AF" />
              </Link>
              <button
                onClick={() => handleDelete(w)}
                style={{ background: "none", border: "none", padding: "0 14px", color: "#9CA3AF" }}
                data-testid={`m-wishlist-delete-${w.id}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
