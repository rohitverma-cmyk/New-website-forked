/**
 * Internal preview page for comparing watermark variants on real catalog
 * images. Visit /admin/watermark-preview while logged in as admin to pick
 * the variant you like, then set REACT_APP_WATERMARK_VARIANT in .env.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import Watermark from "../../components/Watermark";
import { mediumImage } from "../../lib/imageUrl";
import { getFabrics } from "../../lib/api";

const VARIANTS = [
  {
    key: "label",
    title: "Current — Always-on label",
    desc: "Bottom-right wordmark with text-shadow. Always visible.",
    pros: "Simple, stable.",
    cons: "Intrusive; competes with product imagery.",
  },
  {
    key: "hover-chip",
    title: "Option A — Hover-revealed chip",
    desc: "Invisible until you hover the card; fades to a glassmorphic pill.",
    pros: "Cleanest, premium feel. Doesn't fight the photo.",
    cons: "Lowest anti-scrape strength (screenshots can avoid hover).",
  },
  {
    key: "tiled",
    title: "Option B — Tiled diagonal pattern",
    desc: "Faint repeating Locofast wordmark across the full image.",
    pros: "High anti-scrape — impossible to crop out.",
    cons: "Slightly noisier than option A.",
  },
  {
    key: "bottom-bar",
    title: "Option C — Bottom film-credit bar",
    desc: "Thin gradient strip with wordmark on the bottom edge.",
    pros: "Editorial / catalog look. Medium anti-scrape.",
    cons: "Adds a 24px band to every image.",
  },
];

const AdminWatermarkPreview = () => {
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Pull a handful of real fabrics with images so the comparison
        // isn't biased by a single photo's lighting.
        const res = await getFabrics({ limit: 4, page: 1 });
        const list = (res.data || []).filter((f) => Array.isArray(f.images) && f.images.length);
        if (alive) setFabrics(list.slice(0, 4));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AdminLayout>
      <div className="max-w-7xl" data-testid="watermark-preview-page">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Watermark variants</h1>
          <p className="text-gray-600 text-sm mt-1">
            Live preview on real catalog images. Hover the cards in Option A to see the chip appear.
            Once you decide, set <code className="bg-gray-100 px-1 rounded">REACT_APP_WATERMARK_VARIANT</code>{" "}
            in <code className="bg-gray-100 px-1 rounded">/app/frontend/.env</code> to your pick.
          </p>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading sample fabrics…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" data-testid="watermark-grid">
            {VARIANTS.map((v) => (
              <section
                key={v.key}
                className="bg-white border border-gray-200 rounded-xl p-5"
                data-testid={`watermark-variant-${v.key}`}
              >
                <header className="mb-4">
                  <h2 className="text-base font-semibold text-gray-900">{v.title}</h2>
                  <p className="text-xs text-gray-600 mt-1">{v.desc}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Pros: {v.pros}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      Cons: {v.cons}
                    </span>
                  </div>
                </header>

                <div className="grid grid-cols-2 gap-3">
                  {fabrics.map((f) => (
                    <div
                      key={f.id}
                      className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
                    >
                      <img
                        src={mediumImage(f.images?.[0])}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                      <Watermark variant={v.key} size="md" />
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white/90 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                        {f.name}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminWatermarkPreview;
