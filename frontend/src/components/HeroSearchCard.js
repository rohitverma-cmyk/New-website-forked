import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { getCategories } from "../lib/api";

const COMING_SOON_THRESHOLD = 20;

const COMPOSITIONS = [
  "100% Cotton",
  "100% Polyester",
  "Cotton-Polyester",
  "100% Viscose",
  "Cotton-Lycra",
  "100% Linen",
];

const WEIGHT_BUCKETS = [
  { label: "Light (< 150 GSM)", min_gsm: "", max_gsm: "150" },
  { label: "Medium (150–250 GSM)", min_gsm: "150", max_gsm: "250" },
  { label: "Heavy (> 250 GSM)", min_gsm: "250", max_gsm: "" },
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
};

const POPULAR = [
  { label: "Raw selvedge", params: { category: "Denim", composition: "100% Cotton" } },
  { label: "Organic cotton", params: { category: "Cotton Fabrics", composition: "100% Cotton" } },
  { label: "Cotton-Lycra", params: { composition: "Cotton-Lycra" } },
  { label: "Recycled polyester", params: { category: "Sustainable Fabrics" } },
];

const HIDDEN_NAMES = new Set(["Greige", "TEST_Refactor Category", "TEST_Debug Category"]);

const HeroSearchCard = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState(null); // active category NAME (or null = all)
  const [composition, setComposition] = useState("");
  const [weightIdx, setWeightIdx] = useState("");
  const [priceIdx, setPriceIdx] = useState("");

  useEffect(() => {
    getCategories()
      .then((res) => {
        const list = (res?.data || [])
          .filter((c) => !HIDDEN_NAMES.has(c.name))
          .sort((a, b) => (b.fabric_count || 0) - (a.fabric_count || 0));
        setCategories(list);
        const firstReady = list.find((c) => (c.fabric_count || 0) >= COMING_SOON_THRESHOLD);
        if (firstReady) setActive(firstReady.name);
      })
      .catch(() => setCategories([]));
  }, []);

  const activeCategory = useMemo(
    () => categories.find((c) => c.name === active) || null,
    [categories, active]
  );

  const search = (overrides = {}) => {
    const params = new URLSearchParams();
    const catName = overrides.category ?? active;
    // Find category ID from name for proper API filtering
    const catObj = categories.find((c) => c.name === catName);
    if (catObj) params.set("category", catObj.id);
    const comp = overrides.composition ?? composition;
    if (comp) params.set("composition", comp);
    const w = overrides.weight ?? (weightIdx !== "" ? WEIGHT_BUCKETS[weightIdx] : null);
    if (w) {
      if (w.min_gsm) params.set("min_gsm", w.min_gsm);
      if (w.max_gsm) params.set("max_gsm", w.max_gsm);
    }
    const p = overrides.price ?? (priceIdx !== "" ? PRICE_BUCKETS[priceIdx] : null);
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
              onClick={() => setActive(c.name)}
              data-testid={`hero-cat-${c.slug || c.name.toLowerCase().replace(/\s+/g, "-")}`}
              className={`relative inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium border transition-all ${
                isActive
                  ? "bg-white text-neutral-900 border-white"
                  : `text-white/80 border-transparent hover:bg-white/10 ${comingSoon ? "opacity-75" : ""}`
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
              <span className={isActive ? "text-neutral-500 text-[11px] ml-0.5" : "text-white/50 text-[11px] ml-0.5"}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_1fr_auto] gap-2 pt-3">
        <FieldSelect
          label="Composition"
          value={composition}
          onChange={setComposition}
          options={[{ value: "", label: "Any composition" }].concat(
            COMPOSITIONS.map((c) => ({ value: c, label: c }))
          )}
          testid="hero-composition"
        />
        <FieldSelect
          label="Weight · GSM"
          value={weightIdx}
          onChange={setWeightIdx}
          options={[{ value: "", label: "Any weight" }].concat(
            WEIGHT_BUCKETS.map((b, i) => ({ value: String(i), label: b.label }))
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
          onClick={() => search()}
          data-testid="hero-search-submit"
          className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-6 py-3 transition-all hover:-translate-y-px shadow-lg shadow-orange-900/20"
        >
          <Search size={17} />
          Search
        </button>
      </div>

      {/* Popular chips */}
      <div className="flex flex-wrap items-center gap-2 pt-3 pb-1 text-[11px] text-white/55">
        <span className="uppercase tracking-wider">Popular</span>
        {POPULAR.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              if (p.params.category) setActive(p.params.category);
              if (p.params.composition) setComposition(p.params.composition);
              search({ category: p.params.category, composition: p.params.composition });
            }}
            data-testid={`hero-popular-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
            className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/15 text-white/85 border border-white/10 text-xs transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      {activeCategory && (activeCategory.fabric_count || 0) < COMING_SOON_THRESHOLD && (
        <p className="pt-2 text-xs text-white/60" data-testid="hero-coming-soon-note">
          {activeCategory.name.replace(/ Fabrics$/, "")} is rolling out soon — we're listing more SKUs every week.
        </p>
      )}
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
