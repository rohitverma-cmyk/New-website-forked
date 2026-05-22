/**
 * Owner-view of a single wishlist — `/account/wishlists/:id`
 *
 * Lets the customer rename the list, share/revoke a public link, and
 * remove fabrics. Each item links back to its fabric detail page.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Heart, ArrowLeft, Pencil, Share2, Copy, RefreshCcw, Eye, EyeOff,
  Trash2, Loader2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import CustomerLoginModal from "../components/CustomerLoginModal";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import {
  getWishlist, updateWishlist, shareWishlist, removeFromWishlist,
} from "../lib/api";

const fabricSlug = (f) => f.slug || `${f.id}`;
const cover = (f) => (f.images && f.images[0]) || "";
const priceOf = (f) => Number(f.rate_per_meter || f.price_per_meter || 0);

export default function CustomerWishlistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, isLoggedIn, loading: authLoading } = useCustomerAuth();
  const [wl, setWl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { setShowLogin(true); setLoading(false); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, id]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await getWishlist(token, id);
      setWl(r.data);
      setNewName(r.data.name);
    } catch (e) {
      toast.error("Wishlist not found");
      navigate("/account/wishlists");
    }
    setLoading(false);
  };

  const handleRename = async () => {
    const name = newName.trim();
    if (!name || name === wl.name) { setEditing(false); return; }
    setBusy(true);
    try {
      await updateWishlist(token, id, { name });
      toast.success("Renamed");
      setEditing(false);
      refresh();
    } catch (e) {
      toast.error("Failed to rename");
    }
    setBusy(false);
  };

  const handleShare = async (regenerate = false) => {
    setBusy(true);
    try {
      const r = await shareWishlist(token, id, regenerate);
      const url = `${window.location.origin}/wishlist/${r.data.share_token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to clipboard");
      } catch {
        toast.success("Share link ready");
      }
      refresh();
    } catch (e) {
      toast.error("Failed to generate share link");
    }
    setBusy(false);
  };

  const handleRevoke = async () => {
    if (!window.confirm("Anyone with the current link will lose access. Continue?")) return;
    setBusy(true);
    try {
      await updateWishlist(token, id, { is_public: false });
      toast.success("Share link revoked");
      refresh();
    } catch (e) {
      toast.error("Failed to revoke");
    }
    setBusy(false);
  };

  const handleCopyLink = async () => {
    if (!wl?.share_token) return;
    const url = `${window.location.origin}/wishlist/${wl.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed — long-press the link below");
    }
  };

  const handleRemoveItem = async (fid) => {
    setBusy(true);
    try {
      await removeFromWishlist(token, id, fid);
      refresh();
    } catch {
      toast.error("Failed to remove");
    }
    setBusy(false);
  };

  if (!isLoggedIn && !authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="wishlist-detail-signin">
          <Heart size={36} className="mx-auto text-rose-300 mb-2" />
          <p className="text-base font-medium text-gray-900 mb-1">Sign in to view this wishlist</p>
          <button onClick={() => setShowLogin(true)} className="px-5 py-2 mt-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium">
            Sign in
          </button>
          <CustomerLoginModal open={showLogin} onClose={() => setShowLogin(false)} />
        </main>
        <Footer />
      </div>
    );
  }

  if (loading || !wl) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">
          <Loader2 size={24} className="animate-spin mx-auto" />
        </main>
        <Footer />
      </div>
    );
  }

  const shareUrl = wl.share_token ? `${window.location.origin}/wishlist/${wl.share_token}` : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-6" data-testid="wishlist-detail-page">
        <Link to="/account/wishlists" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft size={14} /> Back to wishlists
        </Link>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                    maxLength={80}
                    className="text-xl font-bold border-b-2 border-rose-300 focus:outline-none focus:border-rose-500 bg-transparent"
                    autoFocus
                    data-testid="wishlist-rename-input"
                  />
                  <button onClick={handleRename} disabled={busy} className="px-3 py-1.5 bg-rose-500 text-white rounded text-sm font-medium" data-testid="wishlist-rename-save">
                    Save
                  </button>
                  <button onClick={() => { setEditing(false); setNewName(wl.name); }} className="text-gray-400 text-sm">Cancel</button>
                </div>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                  <Heart className="text-rose-500" /> {wl.name}
                  <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-gray-600" title="Rename" data-testid="wishlist-rename-btn">
                    <Pencil size={16} />
                  </button>
                </h1>
              )}
              <p className="text-sm text-gray-500 mt-1">
                {wl.fabric_count} {wl.fabric_count === 1 ? "fabric" : "fabrics"} saved
                {wl.is_public && <span className="ml-2 text-emerald-600">· Public link active</span>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!wl.is_public ? (
                <button
                  onClick={() => handleShare(false)}
                  disabled={busy || wl.fabric_count === 0}
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  data-testid="wishlist-share-btn"
                >
                  <Share2 size={14} /> Share
                </button>
              ) : (
                <>
                  <button onClick={handleCopyLink} className="px-3 py-2 border border-gray-200 rounded-lg text-sm inline-flex items-center gap-1.5" data-testid="wishlist-copy-link">
                    <Copy size={14} /> Copy link
                  </button>
                  <button onClick={() => handleShare(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm inline-flex items-center gap-1.5" title="Generate a new link (old one stops working)">
                    <RefreshCcw size={14} />
                  </button>
                  <button onClick={handleRevoke} className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm inline-flex items-center gap-1.5" data-testid="wishlist-revoke-btn">
                    <EyeOff size={14} /> Stop sharing
                  </button>
                </>
              )}
            </div>
          </div>

          {wl.is_public && shareUrl && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 break-all" data-testid="wishlist-share-url">
              <p className="mb-1 font-medium flex items-center gap-1.5"><Eye size={12} /> Anyone with this link can view (no login required):</p>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{shareUrl}</a>
            </div>
          )}
        </div>

        {/* Items */}
        {wl.items?.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center">
            <Heart size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-600">No fabrics saved yet.</p>
            <Link to="/inventory" className="inline-block mt-3 text-rose-600 underline text-sm">Browse fabrics →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="wishlist-items-grid">
            {wl.items?.map((f) => (
              <div key={f.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden group relative">
                <Link to={`/fabric/${fabricSlug(f)}`} className="block">
                  {cover(f) ? (
                    <img src={cover(f)} alt={f.name} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-300">
                      <Heart size={28} />
                    </div>
                  )}
                </Link>
                <button
                  onClick={() => handleRemoveItem(f.id)}
                  disabled={busy}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 shadow flex items-center justify-center text-red-500 hover:bg-red-50"
                  title="Remove"
                  data-testid={`wishlist-remove-${f.id}`}
                >
                  <Trash2 size={14} />
                </button>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{f.name}</p>
                  {priceOf(f) > 0 && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">₹{priceOf(f).toLocaleString("en-IN")}/m</p>
                  )}
                  {f.seller_company && <p className="text-[11px] text-gray-400 truncate">{f.seller_company}</p>}
                  <Link to={`/fabric/${fabricSlug(f)}`} className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1">
                    View <ExternalLink size={11} />
                  </Link>
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
