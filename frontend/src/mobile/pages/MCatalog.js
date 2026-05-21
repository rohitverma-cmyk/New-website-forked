import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Search, X, ArrowDownUp } from "lucide-react";
import api from "../../lib/api";
import FabricCard, { FabricCardSkeleton } from "../components/FabricCard";
import BottomSheet from "../components/BottomSheet";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "A → Z" },
];

const FABRIC_TYPES = [
  { value: "woven", label: "Woven" },
  { value: "knitted", label: "Knit" },
];

const GSM_BUCKETS = [
  { value: "0-150", label: "Light (< 150 GSM)" },
  { value: "150-250", label: "Medium (150–250)" },
  { value: "250-350", label: "Heavy (250–350)" },
  { value: "350-1000", label: "Very heavy (> 350)" },
];

export default function MCatalog() {
  const [params, setParams] = useSearchParams();
  const [fabrics, setFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const searchInputRef = useRef(null);

  // Read state from URL
  const q = params.get("q") || "";
  const categoryId = params.get("category") || "";
  const fabricType = params.get("type") || "";
  const gsmBucket = params.get("gsm") || "";
  const bookable = params.get("bookable") === "1";
  const sort = params.get("sort") || "newest";
  const focus = params.get("focus") || "";

  // Pending filter state (committed only on Apply)
  const [pending, setPending] = useState({ categoryId, fabricType, gsmBucket, bookable });

  const updateParams = useCallback((updates) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === "" || v == null || v === false) next.delete(k);
        else next.set(k, v === true ? "1" : String(v));
      });
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          api.get("/fabrics"),
          categories.length ? Promise.resolve({ data: categories }) : api.get("/categories"),
        ]);
        if (!alive) return;
        setFabrics(Array.isArray(fRes.data) ? fRes.data : []);
        if (!categories.length) setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      } catch (err) {
        console.error("Catalog fetch failed:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // Focus search on mount if requested
  useEffect(() => {
    if (focus === "search" && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 200);
      updateParams({ focus: "" });
    }
  }, [focus, updateParams]);

  // Client-side filter — backend doesn't expose query params for all fields, so we filter here.
  const filtered = useMemo(() => {
    let list = fabrics.slice();
    const qLower = q.trim().toLowerCase();
    if (qLower) {
      list = list.filter((f) => {
        const haystack = [
          f.name, f.fabric_code, f.color, f.finish, f.description,
          (f.tags || []).join(" "), f.category_name,
          typeof f.composition === "string"
            ? f.composition
            : (f.composition || []).map((c) => c.material).join(" "),
        ].join(" ").toLowerCase();
        return haystack.includes(qLower);
      });
    }
    if (categoryId) list = list.filter((f) => f.category_id === categoryId);
    if (fabricType) list = list.filter((f) => (f.fabric_type || "").toLowerCase() === fabricType);
    if (gsmBucket) {
      const [lo, hi] = gsmBucket.split("-").map(Number);
      list = list.filter((f) => {
        const g = parseFloat(f.gsm);
        return !isNaN(g) && g >= lo && g < hi;
      });
    }
    if (bookable) list = list.filter((f) => f.is_bookable);

    switch (sort) {
      case "price-asc":
        list.sort((a, b) => (parseFloat(a.sample_price) || 9e9) - (parseFloat(b.sample_price) || 9e9));
        break;
      case "price-desc":
        list.sort((a, b) => (parseFloat(b.sample_price) || 0) - (parseFloat(a.sample_price) || 0));
        break;
      case "name-asc":
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      default: // newest
        list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    }
    return list;
  }, [fabrics, q, categoryId, fabricType, gsmBucket, bookable, sort]);

  const activeFilterCount = [categoryId, fabricType, gsmBucket, bookable ? "1" : ""].filter(Boolean).length;

  const openFilters = () => { setPending({ categoryId, fabricType, gsmBucket, bookable }); setFilterOpen(true); };
  const applyFilters = () => {
    updateParams({
      category: pending.categoryId,
      type: pending.fabricType,
      gsm: pending.gsmBucket,
      bookable: pending.bookable,
    });
    setFilterOpen(false);
  };
  const clearAllFilters = () => {
    setPending({ categoryId: "", fabricType: "", gsmBucket: "", bookable: false });
  };
  const removeChip = (key) => {
    if (key === "bookable") updateParams({ bookable: false });
    else if (key === "category") updateParams({ category: "" });
    else if (key === "type") updateParams({ type: "" });
    else if (key === "gsm") updateParams({ gsm: "" });
  };
  const currentCategory = categories.find((c) => c.id === categoryId);

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: "sticky", top: "calc(var(--m-appbar-h) + env(safe-area-inset-top, 0px))", background: "var(--m-bg)", zIndex: 10, padding: "10px 16px 6px" }}>
        <div className="m-card" style={{ padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={18} color="var(--m-ink-3)" />
          <input
            ref={searchInputRef}
            value={q}
            onChange={(e) => updateParams({ q: e.target.value })}
            placeholder="Search fabric, color, GSM…"
            style={{ flex: 1, border: "none", outline: "none", padding: "10px 0", fontSize: 15, background: "transparent", color: "var(--m-ink)" }}
          />
          {q && (
            <button onClick={() => updateParams({ q: "" })} style={{ background: "none", border: "none", padding: 6, color: "var(--m-ink-3)", cursor: "pointer" }} aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <button onClick={openFilters} className="m-chip" style={{ padding: "8px 12px", fontWeight: 600, background: activeFilterCount ? "var(--m-ink)" : "var(--m-surface)", color: activeFilterCount ? "#fff" : "var(--m-ink-2)", borderColor: activeFilterCount ? "var(--m-ink)" : "var(--m-border-2)" }}>
            <Filter size={14} /> Filter{activeFilterCount ? ` · ${activeFilterCount}` : ""}
          </button>
          <button onClick={() => setSortOpen(true)} className="m-chip" style={{ padding: "8px 12px", fontWeight: 600 }}>
            <ArrowDownUp size={14} /> {SORTS.find((s) => s.value === sort)?.label || "Sort"}
          </button>
          <div style={{ flex: 1 }} />
          <div className="m-caption">{filtered.length} item{filtered.length === 1 ? "" : "s"}</div>
        </div>
        {/* Active filter chips */}
        {(currentCategory || fabricType || gsmBucket || bookable) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {currentCategory && (
              <span className="m-chip m-chip-orange" style={{ padding: "5px 10px" }}>
                {currentCategory.name}
                <button onClick={() => removeChip("category")} style={{ background: "none", border: "none", padding: 0, marginLeft: 4, color: "inherit", display: "inline-flex", cursor: "pointer" }}><X size={12} /></button>
              </span>
            )}
            {fabricType && (
              <span className="m-chip m-chip-orange" style={{ padding: "5px 10px" }}>
                {FABRIC_TYPES.find((t) => t.value === fabricType)?.label}
                <button onClick={() => removeChip("type")} style={{ background: "none", border: "none", padding: 0, marginLeft: 4, color: "inherit", display: "inline-flex", cursor: "pointer" }}><X size={12} /></button>
              </span>
            )}
            {gsmBucket && (
              <span className="m-chip m-chip-orange" style={{ padding: "5px 10px" }}>
                {GSM_BUCKETS.find((g) => g.value === gsmBucket)?.label}
                <button onClick={() => removeChip("gsm")} style={{ background: "none", border: "none", padding: 0, marginLeft: 4, color: "inherit", display: "inline-flex", cursor: "pointer" }}><X size={12} /></button>
              </span>
            )}
            {bookable && (
              <span className="m-chip m-chip-orange" style={{ padding: "5px 10px" }}>
                ⚡ Book Now
                <button onClick={() => removeChip("bookable")} style={{ background: "none", border: "none", padding: 0, marginLeft: 4, color: "inherit", display: "inline-flex", cursor: "pointer" }}><X size={12} /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Results grid */}
      <div className="m-container" style={{ marginTop: 8 }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {[0, 1, 2].map((i) => <FabricCardSkeleton key={i} variant="grid" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onReset={() => setParams({}, { replace: true })} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((f) => (
              <div key={f.id} style={{ minWidth: 0 }}>
                <FabricCard fabric={f} variant="grid" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter sheet */}
      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        footer={
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={clearAllFilters} className="m-btn m-btn-ghost" style={{ flex: 1 }}>Clear all</button>
            <button onClick={applyFilters} className="m-btn m-btn-primary" style={{ flex: 2 }}>Apply</button>
          </div>
        }
      >
        <FilterGroup label="Quick filters">
          <ChipToggle on={pending.bookable} onChange={(v) => setPending({ ...pending, bookable: v })}>⚡ Book Now only</ChipToggle>
        </FilterGroup>

        <FilterGroup label="Category">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ChipToggle on={pending.categoryId === ""} onChange={() => setPending({ ...pending, categoryId: "" })}>All</ChipToggle>
            {categories.map((c) => (
              <ChipToggle key={c.id} on={pending.categoryId === c.id} onChange={() => setPending({ ...pending, categoryId: c.id })}>
                {c.name}
              </ChipToggle>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Fabric type">
          <div style={{ display: "flex", gap: 8 }}>
            <ChipToggle on={pending.fabricType === ""} onChange={() => setPending({ ...pending, fabricType: "" })}>All</ChipToggle>
            {FABRIC_TYPES.map((t) => (
              <ChipToggle key={t.value} on={pending.fabricType === t.value} onChange={() => setPending({ ...pending, fabricType: t.value })}>
                {t.label}
              </ChipToggle>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Weight (GSM)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <ChipToggle on={pending.gsmBucket === ""} onChange={() => setPending({ ...pending, gsmBucket: "" })}>Any weight</ChipToggle>
            {GSM_BUCKETS.map((g) => (
              <ChipToggle key={g.value} on={pending.gsmBucket === g.value} onChange={() => setPending({ ...pending, gsmBucket: g.value })}>
                {g.label}
              </ChipToggle>
            ))}
          </div>
        </FilterGroup>
      </BottomSheet>

      {/* Sort sheet */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => { updateParams({ sort: s.value }); setSortOpen(false); }}
              style={{
                background: "transparent", border: "none", padding: "14px 0", textAlign: "left",
                fontSize: 15, color: sort === s.value ? "var(--m-orange-700)" : "var(--m-ink)",
                fontWeight: sort === s.value ? 700 : 500, borderBottom: "1px solid var(--m-border)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              {s.label}
              {sort === s.value && <span style={{ color: "var(--m-orange)", fontSize: 18 }}>✓</span>}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function ChipToggle({ on, onChange, children }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={"m-chip" + (on ? " m-chip-on" : "")}
      style={{ padding: "9px 14px", fontWeight: 500, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

function EmptyState({ onReset }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
      <div className="m-title" style={{ marginBottom: 4 }}>No fabrics match</div>
      <p className="m-body" style={{ marginBottom: 16 }}>Try adjusting your search or filters.</p>
      <button onClick={onReset} className="m-btn m-btn-outline">Clear all filters</button>
    </div>
  );
}
