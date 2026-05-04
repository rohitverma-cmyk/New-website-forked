import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { getCategories } from "../lib/api";

const COMING_SOON_THRESHOLD = 10;

const WEIGHT_BUCKETS = [
  { label: "Light (< 150 GSM)", min_gsm: "", max_gsm: "150" },
  { label: "Medium (150–250 GSM)", min_gsm: "150", max_gsm: "250" },
  { label: "Heavy (> 250 GSM)", min_gsm: "250", max_gsm: "" },
];

// Denim is always spec'd in oz/yd². Classic weight-classes:
const OZ_WEIGHT_BUCKETS = [
  { label: "Lightweight (< 9 oz)", min_oz: "", max_oz: "9" },
  { label: "Medium (9–12 oz)", min_oz: "9", max_oz: "12" },
  { label: "Heavyweight (> 12 oz)", min_oz: "12", max_oz: "" },
];

const PRICE_BUCKETS = [
  { label: "Under ₹200/m", min_price: "", max_price: "200" },
  { label: "₹200 – ₹400/m", min_price: "200", max_price: "400" },
  { label: "₹400 – ₹700/m", min_price: "400", max_price: "700" },
  { label: "Over ₹700/m", min_price: "700", max_price: "" },
];

// Small swatch colours for category pills
const SWATCH = {
  "Cotton Fabrics": "#d6c9a0",
  "Polyester Fabrics": "#3f6d6b",
  "Denim": "#1e3a8a",
  "Viscose": "#b399d4",
  "Linen": "#c9b48a",
  "Knits": "#cfd6e1",
  "Sustainable Fabrics": "#6aa463",
  "Blended Fabrics": "#a8957a",
};

const HIDDEN_NAMES = new Set(["Greige", "TEST_Refactor Category", "TEST_Debug Category"]);

// Manual ordering for the hero search pills. Lower rank = further left.
// Anything not listed falls back to fabric_count-desc (after the ranked set).
const CATEGORY_ORDER = ["Denim", "Cotton Fabrics", "Cotton"];
const categoryRank = (name) => {
  const i = CATEGORY_ORDER.indexOf(name);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
};

const HeroSearchCard = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState(null); // active category NAME (or null = all)
  const [weightIdx, setWeightIdx] = useState("");
  const [priceIdx, setPriceIdx] = useState("");

  const isDenim = active === "Denim";
  const weightBuckets = isDenim ? OZ_WEIGHT_BUCKETS : WEIGHT_BUCKETS;
  const weightLabel = isDenim ? "Weight · OZ" : "Weight · GSM";

  // Reset the weight bucket whenever the category flips between Denim and non-Denim,
  // otherwise a stale index could map to a wrong label.
  useEffect(() => {
    setWeightIdx("");
  }, [isDenim]);

  useEffect(() => {
    getCategories()
      .then((res) => {
        const list = (res?.data || [])
          .filter((c) => !HIDDEN_NAMES.has(c.name))
          .sort((a, b) => {
            const ra = categoryRank(a.name);
            const rb = categoryRank(b.name);
            if (ra !== rb) return ra - rb;
            return (b.fabric_count || 0) - (a.fabric_count || 0);
          });
        setCategories(list);
        const firstReady = list.find((c) => (c.fabric_count || 0) >= COMING_SOON_THRESHOLD);
        if (firstReady) setActive(firstReady.name);
      })
      .catch(() => setCategories([]));
  }, []);

  const search = () => {
    const params = new URLSearchParams();
    const catObj = categories.find((c) => c.name === active);
    if (catObj) params.set("category", catObj.id);
    const w = weightIdx !== "" ? weightBuckets[weightIdx] : null;
    if (w) {
      if (isDenim) {
        if (w.min_oz) params.set("min_oz", w.min_oz);
        if (w.max_oz) params.set("max_oz", w.max_oz);
      } else {
        if (w.min_gsm) params.set("min_gsm", w.min_gsm);
        if (w.max_gsm) params.set("max_gsm", w.max_gsm);
      }
    }
    const p = priceIdx !== "" ? PRICE_BUCKETS[priceIdx] : null;
    if (p) {
      if (p.min_price) params.set("min_price", p.min_price);
      if (p.max_price) params.set("max_price", p.max_price);
    }
    const qs = params.toString();
    navigate(qs ? `/fabrics?${qs}` : "/fabrics");
  };

  return (
    <div
      className="mx-auto max-w-4xl bg-white/5 backdrop-blur-md border border-white/15 rounded-2xl p-3 md:p-4 shadow-2xl shadow-blue-950/30"
      data-testid="hero-search-card"
    >
      {/* Category pills */}
      <div className="flex gap-1.5 md:gap-2 flex-wrap pb-3 border-b border-white/10">
        {categories.map((c) => {
          const count = c.fabric_count || 0;
          const comingSoon = count < COMING_SOON_THRESHOLD;
          const isActive = active === c.name;
          return (
            <button
              key={c.id}
              type="button"
              disabled={comingSoon}
              onClick={() => { if (!comingSoon) setActive(c.name); }}
              data-testid={`hero-cat-${c.slug || c.name.toLowerCase().replace(/\s+/g, "-")}`}
              aria-disabled={comingSoon}
              title={comingSoon ? `${c.name} — coming soon` : undefined}
              className={`relative inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium border transition-all ${
                comingSoon
                  ? "text-white/50 border-transparent cursor-not-allowed opacity-60"
                  : isActive
                    ? "bg-white text-neutral-900 border-white"
                    : "text-white/80 border-transparent hover:bg-white/10"
              }`}
            >
              {comingSoon && (
                <span
                  className="absolute -top-2 -right-2 bg-orange-500 text-white text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full leading-none border border-white/90 shadow"
                  style={{ letterSpacing: "0.04em" }}
                >
                  COMING SOON
                </span>
              )}
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: SWATCH[c.name] || "#94a3b8" }}
              />
              {c.name.replace(/ Fabrics$/, "")}
              <span className={`${isActive && !comingSoon ? "text-neutral-500" : "text-white/45"} text-[11px] ml-0.5`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row — GSM + Price + Search */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 pt-3">
        <FieldSelect
          label={weightLabel}
          value={weightIdx}
          onChange={setWeightIdx}
          options={[{ value: "", label: "Any weight" }].concat(
            weightBuckets.map((b, i) => ({ value: String(i), label: b.label }))
          )}
          testid="hero-weight"
        />
        <FieldSelect
          label="Price ₹/m"
          value={priceIdx}
          onChange={setPriceIdx}
          options={[{ value: "", label: "Any price" }].concat(
            PRICE_BUCKETS.map((b, i) => ({ value: String(i), label: b.label }))
          )}
          testid="hero-price"
        />
        <button
          type="button"
          onClick={search}
          data-testid="hero-search-submit"
          className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-6 py-3 transition-all hover:-translate-y-px shadow-lg shadow-orange-900/20"
        >
          <Search size={17} />
          Search
        </button>
      </div>

    </div>
  );
};

const FieldSelect = ({ label, value, onChange, options, testid }) => (
  <label className="flex flex-col gap-1 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors cursor-pointer">
    <span className="text-[10px] tracking-[0.08em] uppercase text-white/55 font-semibold">
      {label}
    </span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer appearance-none -mt-0.5"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-neutral-900">
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

export default HeroSearchCard;
