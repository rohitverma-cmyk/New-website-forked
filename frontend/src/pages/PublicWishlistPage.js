/**
 * Public shared-wishlist viewer — `/wishlist/:token`
 *
 * No authentication required. Renders the wishlist owner's curated list
 * with cover, price, seller and a "View on Locofast" CTA. 404s gracefully
 * once the owner revokes the share.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Heart, ExternalLink, Loader2, ShoppingBag } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getSharedWishlist } from "../lib/api";

const fabricSlug = (f) => f.slug || `${f.id}`;
const cover = (f) => (f.images && f.images[0]) || "";
const priceOf = (f) => Number(f.rate_per_meter || f.price_per_meter || 0);

export default function PublicWishlistPage() {
  const { token } = useParams();
  const [wl, setWl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSharedWishlist(token);
        setWl(r.data);
      } catch (e) {
        setNotFound(true);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-400">
          <Loader2 size={24} className="animate-spin mx-auto" />
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !wl) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="public-wishlist-404">
          <Heart size={32} className="mx-auto text-gray-300 mb-2" />
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Wishlist not found</h1>
          <p className="text-sm text-gray-500">The link may have been revoked or the wishlist has been deleted.</p>
          <Link to="/inventory" className="inline-block mt-4 text-rose-600 underline text-sm">Browse Locofast fabrics →</Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8" data-testid="public-wishlist-page">
        {/* Hero */}
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-100 rounded-xl p-6 mb-6">
          <p className="text-xs uppercase tracking-wider text-rose-600 font-semibold mb-1">A shared wishlist</p>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Heart className="text-rose-500" /> {wl.name}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {wl.fabric_count} {wl.fabric_count === 1 ? "fabric" : "fabrics"} curated
            {wl.owner_display && <> by <strong>{wl.owner_display}</strong></>}
          </p>
        </div>

        {wl.items.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center">
            <Heart size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-600">This wishlist is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="public-wishlist-items">
            {wl.items.map((f) => (
              <Link
                key={f.id}
                to={`/fabric/${fabricSlug(f)}`}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-rose-300 hover:shadow-md transition"
              >
                {cover(f) ? (
                  <img src={cover(f)} alt={f.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-300">
                    <Heart size={28} />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{f.name}</p>
                  {priceOf(f) > 0 && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">₹{priceOf(f).toLocaleString("en-IN")}/m</p>
                  )}
                  {f.seller_company && <p className="text-[11px] text-gray-400 truncate">{f.seller_company}</p>}
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                    <ShoppingBag size={11} /> Shop on Locofast
                    <ExternalLink size={10} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-10 pb-6">
          <Link to="/" className="text-xs text-gray-500 hover:text-gray-900">
            Powered by <strong>Locofast</strong> — India's B2B fabric marketplace
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
