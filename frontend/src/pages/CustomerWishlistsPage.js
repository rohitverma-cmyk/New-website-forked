/**
 * Customer's wishlist hub — `/account/wishlists`
 *
 * - Lists all wishlists the customer has created
 * - Quick-create input at the top
 * - Each row links to the detail page (rename, share, manage items)
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, Plus, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { listWishlists, createWishlist, deleteWishlist } from "../lib/api";

export default function CustomerWishlistsPage() {
  const { token, isLoggedIn, loading: authLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      navigate("/login?next=/account/wishlists");
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listWishlists(token);
      setLists(r.data || []);
    } catch (e) {
      toast.error("Could not load wishlists");
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
      // Open the freshly-created list so the user can start adding fabrics.
      navigate(`/account/wishlists/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create wishlist");
    }
    setCreating(false);
  };

  const handleDelete = async (w) => {
    if (!window.confirm(`Delete wishlist "${w.name}"? This cannot be undone.`)) return;
    try {
      await deleteWishlist(token, w.id);
      toast.success("Wishlist deleted");
      refresh();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8" data-testid="wishlists-page">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Heart className="text-rose-500" /> My Wishlists
        </h1>
        <p className="text-sm text-gray-500 mb-6">Save fabrics to themed lists. Share any list with a private link.</p>

        {/* Create */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder='e.g. "SS26 Drops" or "Studio favourites"'
              maxLength={80}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-rose-300 focus:outline-none"
              data-testid="wishlists-new-name-input"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              data-testid="wishlists-create-btn"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <Loader2 size={20} className="animate-spin mx-auto" />
          </div>
        ) : lists.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center" data-testid="wishlists-empty">
            <Heart size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-600">You don't have any wishlists yet.</p>
            <p className="text-xs text-gray-400 mt-1">Create one above, then save fabrics to it from any product page.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="wishlists-list">
            {lists.map((w) => (
              <div key={w.id} className="bg-white border border-gray-200 rounded-lg hover:border-rose-200 transition group">
                <div className="flex items-center">
                  <Link to={`/account/wishlists/${w.id}`} className="flex-1 flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{w.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {w.fabric_count} {w.fabric_count === 1 ? "fabric" : "fabrics"}
                        {w.is_public && <span className="ml-2 text-emerald-600">· Shared</span>}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                  </Link>
                  <button
                    onClick={() => handleDelete(w)}
                    className="px-3 py-3 text-gray-300 hover:text-red-500"
                    title="Delete wishlist"
                    data-testid={`wishlist-delete-${w.id}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
