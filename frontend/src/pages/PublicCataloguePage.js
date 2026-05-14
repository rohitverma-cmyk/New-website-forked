/**
 * Public catalogue viewer — rendered at /c/:slug.
 * No auth, no navbar/footer chrome. Designed to look like a curated
 * client-facing brochure with a big Locofast watermark.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, MapPin, Mail, Phone, ArrowRight, Eye } from "lucide-react";

export default function PublicCataloguePage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.REACT_APP_BACKEND_URL;
    fetch(`${apiUrl}/api/catalogues/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(r.status === 404 ? "Catalogue not found." : "Failed to load catalogue.");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center text-gray-500">
          <Loader2 size={28} className="animate-spin mx-auto text-[#2563EB]" />
          <p className="mt-2 text-sm">Loading curated catalogue…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6">
        <div className="text-center max-w-md">
          <p className="text-5xl mb-3">📂</p>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{error || "Catalogue not available"}</h1>
          <p className="text-sm text-gray-500 mb-6">The link may have expired or been removed.</p>
          <Link to="/fabrics" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:underline">
            Browse all fabrics on Locofast <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const fabrics = data.fabrics || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white relative overflow-hidden" data-testid="public-catalogue">
      <Helmet>
        <title>{data.title} · Locofast</title>
        <meta name="description" content={data.intro?.slice(0, 160) || `Curated fabric catalogue with ${fabrics.length} options from Locofast.`} />
      </Helmet>

      {/* BIG Locofast watermark — fixed, semi-transparent, behind everything.
          Visible across the entire scroll surface so screenshots / forwarded
          PDFs always carry our brand. */}
      <div
        aria-hidden
        className="pointer-events-none select-none fixed inset-0 z-0 flex items-center justify-center"
      >
        <div className="text-[28vw] font-black tracking-tighter text-[#2563EB] opacity-[0.06] whitespace-nowrap">
          LOCOFAST
        </div>
      </div>

      {/* Diagonal repeating "Locofast" watermark — second layer for stronger
          anti-screenshot protection without overwhelming the design. */}
      <div
        aria-hidden
        className="pointer-events-none select-none fixed inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage: "repeating-linear-gradient(-30deg, transparent 0 280px, rgba(37,99,235,0.5) 280px 282px)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
        {/* ── Top bar with Locofast logo + small watermark badge ── */}
        <header className="flex items-center justify-between mb-10">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="https://customer-assets.emergentagent.com/job_aac6e0f4-6bb0-45fd-9410-8acdd3d8c7e7/artifacts/4xs76ay7_locofast.png" alt="Locofast" className="h-8" onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="text-lg font-extrabold tracking-tight text-[#2563EB]">Locofast</span>
          </Link>
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
            Curated by an expert · Locofast.com
          </span>
        </header>

        {/* ── Cover page ── */}
        <section className="mb-12 text-center sm:text-left">
          {data.hero_image_url && (
            <div className="mb-8 rounded-2xl overflow-hidden border border-gray-200 shadow-sm aspect-[16/6]">
              <img src={data.hero_image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="flex-1 min-w-0">
              {data.client_name && (
                <p className="text-xs uppercase tracking-wider font-bold text-[#2563EB] mb-2" data-testid="cat-client-banner">
                  Prepared for {data.client_name}
                </p>
              )}
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-gray-900 leading-tight" data-testid="cat-title">
                {data.title}
              </h1>
              <p className="text-sm text-gray-500 mt-3">
                {fabrics.length} curated fabric{fabrics.length === 1 ? "" : "s"} · Updated {new Date(data.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            {data.client_logo_url && (
              <img
                src={data.client_logo_url}
                alt={data.client_name}
                className="max-h-16 max-w-[180px] object-contain"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
          </div>

          {data.intro && (
            <div className="mt-6 prose prose-sm max-w-3xl text-gray-700 whitespace-pre-line" data-testid="cat-intro">
              {data.intro}
            </div>
          )}
        </section>

        {/* ── Fabric grid (standard pack) ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {fabrics.map((f) => (
            <FabricTile key={f.id} f={f} />
          ))}
        </section>

        {fabrics.length === 0 && (
          <div className="text-center text-gray-500 py-20 mb-12">
            <p>No fabrics in this catalogue yet.</p>
          </div>
        )}

        {/* ── Agent contact footer ── */}
        <footer className="border-t border-gray-200 pt-8 pb-4 mt-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">Your Locofast sourcing partner</p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-base font-bold text-gray-900">{data.agent_name || "Locofast Sourcing Team"}</p>
                <div className="mt-2 flex flex-col sm:flex-row gap-x-5 gap-y-1 text-sm text-gray-600">
                  {data.agent_email && (
                    <a href={`mailto:${data.agent_email}`} className="inline-flex items-center gap-1.5 hover:text-[#2563EB]">
                      <Mail size={12} />{data.agent_email}
                    </a>
                  )}
                  {data.agent_phone && (
                    <a href={`tel:${data.agent_phone}`} className="inline-flex items-center gap-1.5 hover:text-[#2563EB]">
                      <Phone size={12} />{data.agent_phone}
                    </a>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-400 sm:text-right">
                <p className="flex items-center gap-1 sm:justify-end"><Eye size={11} /> {data.view_count} {data.view_count === 1 ? "view" : "views"}</p>
                <p className="mt-1">Powered by <Link to="/" className="font-semibold text-[#2563EB]">Locofast.com</Link></p>
              </div>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-300 mt-5">
            Specs, pricing and availability are indicative. Please confirm with your Locofast sourcing partner before placing orders.
          </p>
        </footer>
      </div>
    </div>
  );
}

const FabricTile = ({ f }) => (
  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-[#2563EB]/30 transition-all" data-testid={`cat-fabric-${f.fabric_code || f.id}`}>
    {f.image_url ? (
      <div className="aspect-square bg-gray-100 overflow-hidden relative">
        <img src={f.image_url} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
        {/* Per-tile mini watermark — discourages cropping individual images */}
        <span className="absolute bottom-2 right-2 text-[9px] uppercase font-bold tracking-wider text-white/80 bg-black/30 px-2 py-0.5 rounded backdrop-blur-sm">
          Locofast
        </span>
        {f.is_bookable && (
          <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full shadow-sm">
            In stock
          </span>
        )}
      </div>
    ) : (
      <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
        No image
      </div>
    )}
    <div className="p-4">
      <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug" data-testid="cat-tile-name">{f.name}</h3>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
        {f.fabric_code && <span className="font-mono">{f.fabric_code}</span>}
        {f.category_name && <span>· {f.category_name}</span>}
      </div>

      {/* Spec strip */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-3 text-[11px]">
        {f.composition && <div className="col-span-2"><span className="text-gray-500">Composition: </span><span className="text-gray-900 font-medium">{f.composition}</span></div>}
        {f.gsm && <div><span className="text-gray-500">Weight: </span><span className="text-gray-900 font-medium">{f.gsm} GSM</span></div>}
        {f.ounce && !f.gsm && <div><span className="text-gray-500">Weight: </span><span className="text-gray-900 font-medium">{f.ounce} oz</span></div>}
        {f.width && <div><span className="text-gray-500">Width: </span><span className="text-gray-900 font-medium">{f.width}"</span></div>}
        {f.fabric_type && <div><span className="text-gray-500">Type: </span><span className="text-gray-900 font-medium capitalize">{f.fabric_type}</span></div>}
        {f.weave_pattern && <div><span className="text-gray-500">Weave: </span><span className="text-gray-900 font-medium">{f.weave_pattern}</span></div>}
        {f.knit_type && <div><span className="text-gray-500">Knit: </span><span className="text-gray-900 font-medium">{f.knit_type}</span></div>}
        {f.color_or_shade && <div><span className="text-gray-500">Colour: </span><span className="text-gray-900 font-medium">{f.color_or_shade}</span></div>}
      </div>

      {/* Pricing strip */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-baseline justify-between">
        <div>
          {f.starting_price ? (
            <>
              <span className="text-base font-extrabold text-gray-900">₹{f.starting_price}</span>
              <span className="text-[11px] text-gray-500"> /{f.unit || "m"}</span>
              <span className="text-[10px] text-gray-400 ml-1">starting</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">Price on request</span>
          )}
        </div>
        {f.moq && f.moq > 0 && (
          <span className="text-[10px] text-gray-500">MOQ: {f.moq} {f.unit || "m"}</span>
        )}
      </div>
      {f.lead_time_days && (
        <p className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
          <MapPin size={9} />Lead time: {f.lead_time_days} days
        </p>
      )}
    </div>
  </div>
);
