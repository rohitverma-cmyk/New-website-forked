// "Trusted by global brands production network" ticker.
//
// Logo strategy (Feb 2026):
//   • Each brand maps to its OFFICIAL website domain
//   • Logos fetched from Logo.dev (https://logo.dev) — successor to the
//     retired Clearbit Logo API, built by the same team
//   • `theme=dark` returns full-colour PNG; `retina=true` doubles the
//     resolution for crisp rendering on Retina displays
//   • Client publishable key lives in REACT_APP_LOGODEV_PK (safe to
//     expose — same idea as Stripe's pk_ keys)
//   • If Logo.dev cannot find a domain (small/regional brand not in
//     their corpus), onError falls back to a styled text wordmark in
//     the brand's signature colour — we never invent a fake logo
//
// Brands marked `confirmed: false` are AMBIGUOUS — the brand name in
// the user's input matches multiple companies. UI shows an amber "?"
// so ops can verify on review. Once confirmed, flip the flag + update
// `domain` if needed.
import { useMemo, useState } from "react";

const LOGO_DEV_PK = process.env.REACT_APP_LOGODEV_PK || "";

const BRANDS = [
  // ── Top 10 confirmed brands — clearest Logo.dev rendering ───────
  { slug: "lidl",         name: "Lidl",            domain: "lidl.com",          confirmed: true,  color: "#0050AA", weight: 900 },
  { slug: "walmart",      name: "Walmart",         domain: "walmart.com",       confirmed: true,  color: "#0071CE", weight: 800 },
  { slug: "levis",        name: "Levi's",          domain: "levi.com",          confirmed: true,  color: "#B91C1C", weight: 900 },
  { slug: "target",       name: "Target",          domain: "target.com",        confirmed: true,  color: "#CC0000", weight: 900 },
  { slug: "c-and-a",      name: "C&A",             domain: "c-and-a.com",       confirmed: true,  color: "#1E3A8A", weight: 900 },
  { slug: "mango",        name: "MANGO",           domain: "mango.com",         confirmed: true,  color: "#000000", weight: 700, tracking: "0.2em" },
  { slug: "firstcry",     name: "FirstCry",        domain: "firstcry.com",      confirmed: true,  color: "#EC4899", weight: 800 },
  { slug: "landmark",     name: "Landmark Group",  domain: "landmarkgroup.com", confirmed: true,  color: "#0F172A", weight: 700 },
  { slug: "lpp",          name: "LPP",             domain: "lppsa.com",         confirmed: true,  color: "#1F2937", weight: 900 },
  { slug: "izumi",        name: "Izumi",           domain: "izumi.co.jp",       confirmed: false, color: "#DC2626", weight: 800 },

  // Dropped from earlier set — Logo.dev returned wrong/unclear logos:
  //   Skiva ("S" mark — generic, not the apparel co)
  //   Children's Apparel ("you me" wordmark — wrong company entirely)
  //   Golden Touch (too generic to verify)
  // Please share correct domains for these and we can re-add them.
];

const buildLogoUrl = (domain) => {
  if (!LOGO_DEV_PK) return null;
  // size=160 keeps the file small (we visually cap at ~44px); retina=true
  // doubles native resolution for crisp rendering on Retina displays.
  // NOTE: don't pass `theme=light` — logo.dev returns 404 for that value,
  // default rendering already works on light backgrounds.
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_PK}&size=160&retina=true`;
};

const LogoCard = ({ brand }) => {
  const [errored, setErrored] = useState(false);
  const url = buildLogoUrl(brand.domain);
  const useImage = url && !errored;

  return (
    <div
      className="flex-shrink-0 w-56 h-28 mx-4 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex items-center justify-center px-5 relative group hover:shadow-md hover:-translate-y-0.5 transition-all"
      title={
        brand.confirmed
          ? brand.name
          : `${brand.name} — please confirm which "${brand.name}" company this represents`
      }
      data-testid={`brand-card-${brand.slug}`}
    >
      {useImage ? (
        <img
          src={url}
          alt={brand.name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="max-h-16 max-w-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300"
          data-testid={`brand-logo-${brand.slug}`}
        />
      ) : (
        // Fallback — never fake a logo, just render the wordmark.
        <span
          className="text-xl sm:text-[22px] font-extrabold whitespace-nowrap"
          style={{
            color: brand.color,
            fontWeight: brand.weight,
            fontStyle: brand.italic ? "italic" : "normal",
            letterSpacing: brand.tracking || "-0.01em",
          }}
          data-testid={`brand-wordmark-${brand.slug}`}
        >
          {brand.name}
        </span>
      )}
      {!brand.confirmed && (
        <span
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-100 border border-amber-300 text-amber-700 text-[9px] font-bold flex items-center justify-center shadow-sm"
          title="Ambiguous brand name — please confirm correct company"
        >
          ?
        </span>
      )}
    </div>
  );
};

const BrandTicker = ({ compact = false }) => {
  // Duplicate the list so the marquee animation loops seamlessly
  // (single set would create a visible jump at the end).
  const doubled = useMemo(() => [...BRANDS, ...BRANDS], []);

  // Compact mode = embedded inside the hero (dark gradient bg). Renders
  // a minimal marquee with no section wrapper, no title, smaller cards.
  if (compact) {
    return (
      <div className="relative w-full overflow-hidden" data-testid="brand-ticker-section">
        <p className="text-center text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] text-white/70 uppercase mb-3">
          Trusted by Global Brand Production Networks
        </p>
        <div className="relative">
          {/* edge-fade for the hero background */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#2563EB] to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#2563EB] to-transparent z-10" />
          <div className="flex animate-marquee" style={{ width: "max-content" }}>
            {doubled.map((b, i) => (
              <LogoCard key={`${b.slug}-${i}`} brand={b} compact />
            ))}
          </div>
        </div>
        <style>{`
          @keyframes locofast-marquee {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            animation: locofast-marquee 45s linear infinite;
          }
          .animate-marquee:hover {
            animation-play-state: paused;
          }
        `}</style>
      </div>
    );
  }

  return (
    <section
      className="py-14 lg:py-16 bg-gradient-to-b from-white to-blue-50/30 overflow-hidden border-y border-gray-100"
      data-testid="brand-ticker-section"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-[#2563EB] uppercase mb-2">
          Multi-Brand Production Corridor
        </p>
        <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-bold text-gray-900 tracking-tight">
          Trusted by global brands production network
        </h2>
        <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-2xl mx-auto">
          Large brands and retail groups source their fabric and samples through Locofast across our production network.
        </p>
      </div>

      <div className="relative">
        {/* edge-fade so the ticker fades into the page instead of hard-cutting */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-white via-white/95 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-white via-white/95 to-transparent z-10" />

        <div className="flex animate-marquee" style={{ width: "max-content" }}>
          {doubled.map((b, i) => (
            <LogoCard key={`${b.slug}-${i}`} brand={b} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes locofast-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: locofast-marquee 45s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
};

export default BrandTicker;
