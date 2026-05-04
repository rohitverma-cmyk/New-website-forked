import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Star, MapPin, Clock, Shield, Award, Package, ChevronRight,
  ExternalLink, MessageSquare, Globe, Truck, CheckCircle2, Box,
  Calendar, Share2, Bookmark, Send, Factory
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import RFQModal from "../components/RFQModal";
import "./SupplierProfile.css";

const API = process.env.REACT_APP_BACKEND_URL;

function StarRating({ rating }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= Math.round(rating) ? "s-f" : "s-e"}>&#9733;</span>
      ))}
    </span>
  );
}

export default function SupplierProfilePage() {
  const { category, city, slug } = useParams();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showRfqModal, setShowRfqModal] = useState(false);

  // Catalog state
  const [catFilter, setCatFilter] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [showAllFabrics, setShowAllFabrics] = useState(false);

  // Sidebar enquiry
  const [enqForm, setEnqForm] = useState({ name: "", company: "", country: "India", product: "", quantity: "", message: "" });
  const [enqSending, setEnqSending] = useState(false);
  const [enqSent, setEnqSent] = useState(false);

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (["overview", "catalog", "inventory", "reviews", "orders"].includes(hash)) setActiveTab(hash);
  }, [location.hash]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const cleanSlug = (slug || "").replace(/\/$/, "");
        const res = await fetch(`${API}/api/suppliers/${cleanSlug}/profile`);
        if (!res.ok) throw new Error("Supplier not found");
        setProfile(await res.json());
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    if (slug) fetchProfile();
  }, [slug]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  };

  const filteredFabrics = useMemo(() => {
    if (!profile) return [];
    let list = [...profile.fabrics];
    if (catFilter) list = list.filter(f => f.category_name === catFilter);
    if (stockOnly) list = list.filter(f => (f.quantity_available || 0) > 0);
    if (sortBy === "price-asc") list.sort((a, b) => (a.price_per_meter || 0) - (b.price_per_meter || 0));
    else if (sortBy === "price-desc") list.sort((a, b) => (b.price_per_meter || 0) - (a.price_per_meter || 0));
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [profile, catFilter, stockOnly, sortBy]);

  const displayFabrics = showAllFabrics ? filteredFabrics : filteredFabrics.slice(0, 12);

  const handleEnquiry = async (e) => {
    e.preventDefault();
    setEnqSending(true);
    try {
      const cleanSlug = (slug || "").replace(/\/$/, "");
      await fetch(`${API}/api/suppliers/${cleanSlug}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: enqForm.name,
          company_name: enqForm.company,
          country: enqForm.country,
          product_interest: enqForm.product,
          quantity: enqForm.quantity,
          message: enqForm.message,
        }),
      });
      setEnqSent(true);
      setTimeout(() => setEnqSent(false), 4000);
      setEnqForm({ name: "", company: "", country: "India", product: "", quantity: "", message: "" });
    } catch { /* silent */ }
    finally { setEnqSending(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  };

  if (loading) return (
    <>
      <Navbar />
      <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
    </>
  );
  if (error || !profile) return (
    <>
      <Navbar />
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4">Supplier Not Found</h1>
        <Link to="/fabrics" className="text-blue-600 hover:underline">Browse all fabrics</Link>
      </div>
    </>
  );

  const s = profile.seller;
  const stats = profile.stats;
  const cats = Object.keys(stats.category_counts);
  const pageTitle = `${s.company_name} — ${s.primary_category || "Fabric"} ${s.business_type} in ${s.city}`;
  const pageDesc = `${s.city}-based ${(s.primary_category || "fabric").toLowerCase()} ${(s.business_type || "manufacturer").toLowerCase()}. ${s.certifications?.length ? s.certifications.join(" & ") + " certified. " : ""}MOQ ${s.moq || "on request"}. ${stats.total_orders}+ orders. ${profile.review_stats.average} from ${profile.review_stats.count} buyers.`;
  const profileUrl = `https://locofast.com/suppliers/${category}/${city}/${slug}`;
  const logoSrc = s.logo_url ? (s.logo_url.startsWith("http") ? s.logo_url : `${API}${s.logo_url}`) : null;
  const initials = s.company_name.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();

  const breadcrumbLD = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: window.location.origin },
      { "@type": "ListItem", position: 2, name: "Suppliers", item: `${window.location.origin}/suppliers` },
      { "@type": "ListItem", position: 3, name: `${(category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`, item: `${window.location.origin}/suppliers/${category}` },
      { "@type": "ListItem", position: 4, name: (city || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), item: `${window.location.origin}/suppliers/${category}/${city}` },
      { "@type": "ListItem", position: 5, name: s.company_name },
    ],
  };
  const orgLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.company_name,
    url: profileUrl,
    address: { "@type": "PostalAddress", addressLocality: s.city, addressRegion: s.state, addressCountry: "IN" },
    ...(logoSrc ? { logo: logoSrc } : {}),
    aggregateRating: { "@type": "AggregateRating", ratingValue: profile.review_stats.average, reviewCount: Math.max(profile.review_stats.count, 1), bestRating: 5 },
  };

  const maxStock = Math.max(...Object.values(stats.stock_by_category), 1);

  return (
    <>
      <Helmet>
        <title>{pageTitle} | Locofast</title>
        <meta name="description" content={pageDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={profileUrl} />
        {logoSrc && <meta property="og:image" content={logoSrc} />}
        <link rel="canonical" href={profileUrl} />
        <script type="application/ld+json">{JSON.stringify(breadcrumbLD)}</script>
        <script type="application/ld+json">{JSON.stringify(orgLD)}</script>
      </Helmet>

      <Navbar />

      <main className="sp-page" data-testid="supplier-profile">
        {/* BREADCRUMB */}
        <div className="breadcrumb-bar">
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb" data-testid="breadcrumbs">
              <li><Link to="/">Home</Link></li>
              <li className="sep">&rsaquo;</li>
              <li><Link to="/suppliers">Suppliers</Link></li>
              <li className="sep">&rsaquo;</li>
              <li><Link to={`/suppliers/${category}`} className="capitalize">{(category || "").replace(/-/g, " ")}</Link></li>
              <li className="sep">&rsaquo;</li>
              <li><Link to={`/suppliers/${category}/${city}`} className="capitalize">{(city || "").replace(/-/g, " ")}</Link></li>
              <li className="sep">&rsaquo;</li>
              <li className="cur">{s.company_name}</li>
            </ol>
          </nav>
        </div>

        <div className="page-wrap">
          <div className="main-grid">
            {/* ═══ LEFT COLUMN ═══ */}
            <div>
              {/* HERO */}
              <div className="hero-card" data-testid="hero-section">
                <div className="hero-body">
                  <div className="hero-top-row">
                    <div className="hero-logo">
                      {logoSrc ? <img src={logoSrc} alt={s.company_name} /> : initials}
                    </div>
                    <div className="hero-top-info">
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 7 }}>
                        {s.gst_verified && <span className="badge badge-verified" data-testid="verified-badge"><CheckCircle2 size={10} /> Verified Supplier</span>}
                        {s.is_premium && <span className="badge badge-premium"><Award size={10} /> Premium</span>}
                        {s.gst_verified && <span className="badge badge-blue"><Shield size={10} /> GST Verified</span>}
                      </div>
                      <h1 className="hero-name" data-testid="supplier-h1">{s.company_name}</h1>
                      <div className="hero-sub">
                        {s.primary_category || "Fabric"} {s.business_type}
                        <span className="dot">&middot;</span>
                        <Link to={`/suppliers/${category}/${city}`}>{s.city}, {s.state}</Link>
                        {s.established_year && <><span className="dot">&middot;</span>Est. {s.established_year}</>}
                        {s.monthly_capacity && <><span className="dot">&middot;</span>{s.monthly_capacity} capacity</>}
                      </div>
                      <div className="rating-row">
                        <StarRating rating={profile.review_stats.average} />
                        <span className="r-num">{profile.review_stats.average}</span>
                        <span className="r-ct">{profile.review_stats.count} reviews</span>
                        <div className="r-sep" />
                        <span className="r-stat"><strong>{stats.total_orders.toLocaleString()}+</strong> orders</span>
                        <div className="r-sep" />
                        <span className="r-stat">On-time <strong>{stats.on_time_rate}%</strong></span>
                      </div>
                    </div>
                    <div className="hero-actions">
                      <button className="btn-outline" style={{ padding: "8px 14px", fontSize: 12 }} onClick={copyLink} data-testid="share-btn"><Share2 size={13} /> Share</button>
                      <button className="btn-outline" style={{ padding: "8px 14px", fontSize: 12 }} data-testid="save-btn"><Bookmark size={13} /> Save</button>
                    </div>
                  </div>

                  {cats.length > 0 && (
                    <div className="tag-row">
                      {cats.map(cat => (
                        <Link key={cat} to={`/fabrics?category=${encodeURIComponent(cat)}`} className="tag">{cat}</Link>
                      ))}
                      {s.export_markets?.map(m => (
                        <span key={m} className="tag">Exports to {m}</span>
                      ))}
                    </div>
                  )}

                  <div className="hero-cta-row">
                    <button className="btn-primary" onClick={() => document.getElementById("enq-form")?.scrollIntoView({ behavior: "smooth" })} data-testid="contact-supplier-btn">
                      <MessageSquare size={14} /> Send Enquiry
                    </button>
                    <button className="btn-outline-blue" onClick={() => setShowRfqModal(true)} data-testid="request-sample-btn">
                      <Package size={14} /> Request Sample
                    </button>
                  </div>
                </div>
              </div>

              {/* METRICS */}
              <div className="metrics-row" data-testid="metrics-row">
                <div className="metric-card">
                  <div className="m-top">
                    <div><div className="m-val">{stats.total_orders.toLocaleString()}</div><div className="m-label">Orders Fulfilled</div></div>
                    <div className="m-icon mi-blue"><Package size={15} strokeWidth={2} color="var(--blue-600)" /></div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="m-top">
                    <div><div className="m-val">{stats.on_time_rate}%</div><div className="m-label">On-Time Delivery</div></div>
                    <div className="m-icon mi-green"><Truck size={15} strokeWidth={2} color="var(--green)" /></div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="m-top">
                    <div><div className="m-val">{stats.total_skus}</div><div className="m-label">Active SKUs</div></div>
                    <div className="m-icon mi-blue"><Box size={15} strokeWidth={2} color="var(--blue-600)" /></div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="m-top">
                    <div><div className="m-val">{stats.years_in_business} yrs</div><div className="m-label">In Business</div></div>
                    <div className="m-icon mi-amber"><Calendar size={15} strokeWidth={2} color="var(--amber)" /></div>
                  </div>
                  {s.established_year && <div className="m-delta" style={{ color: "var(--amber)" }}>Est. {s.established_year}</div>}
                </div>
              </div>

              {/* TABS */}
              <div className="tabs-card">
                <nav className="tabs-nav" role="tablist" data-testid="tab-nav">
                  {[
                    { id: "overview", label: "Overview" },
                    { id: "catalog", label: "Catalog", count: stats.total_skus },
                    { id: "inventory", label: "Inventory" },
                    { id: "reviews", label: "Reviews", count: profile.review_stats.count },
                    { id: "orders", label: "Orders & Terms" },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
                      onClick={() => switchTab(tab.id)}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.label}
                      {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
                    </button>
                  ))}
                </nav>

                {/* ── OVERVIEW ── */}
                <div className={`tab-pane${activeTab === "overview" ? " active" : ""}`} data-testid="panel-overview">
                  <div className="overview-grid">
                    <div>
                      <div className="sec-label">Business Details</div>
                      <table className="detail-table">
                        <tbody>
                          {[
                            ["Legal name", s.company_name],
                            ["GST number", s.gst_verified ? "Verified" : "Not provided"],
                            ["Business type", s.business_type],
                            ["Established", s.established_year || "\u2014"],
                            ["Annual turnover", s.turnover_range || "\u2014"],
                            ["Employees", s.employee_count || "\u2014"],
                            ["Factory area", s.factory_size || "\u2014"],
                            ["Location", `${s.city}, ${s.state}`],
                            ["Export markets", s.export_markets?.join(", ") || "Domestic"],
                          ].map(([key, val], i) => (
                            <tr key={i}>
                              <td className="dt-key">{key}</td>
                              <td className="dt-val">
                                {key === "GST number" && s.gst_verified ? (
                                  <>{val} <span className="badge badge-verified" style={{ fontSize: 10 }}><CheckCircle2 size={9} /> Verified</span></>
                                ) : key === "Location" ? (
                                  <a href={`https://maps.google.com/?q=${encodeURIComponent(`${s.city}, ${s.state}, India`)}`} target="_blank" rel="noopener noreferrer">{val} <ExternalLink size={11} style={{ display: "inline" }} /></a>
                                ) : val}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <div className="sec-label">Factory & Production</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                        <div className="asset-card">
                          <div className="asset-icon ai-blue"><Factory size={14} strokeWidth={2} /></div>
                          <div className="asset-val">{s.monthly_capacity || "On request"}</div>
                          <div className="asset-lbl">Monthly capacity</div>
                        </div>
                        <div className="asset-card">
                          <div className="asset-icon ai-amber"><Clock size={14} strokeWidth={2} /></div>
                          <div className="asset-val">{s.standard_lead_time}</div>
                          <div className="asset-lbl">Standard lead time</div>
                        </div>
                        <div className="asset-card">
                          <div className="asset-icon ai-green"><Package size={14} strokeWidth={2} /></div>
                          <div className="asset-val">{s.sample_lead_time}</div>
                          <div className="asset-lbl">Sample lead time</div>
                        </div>
                        <div className="asset-card">
                          <div className="asset-icon ai-ink"><MapPin size={14} strokeWidth={2} /></div>
                          <div className="asset-val">{s.factory_size || "\u2014"}</div>
                          <div className="asset-lbl">Factory area</div>
                        </div>
                      </div>

                      <table className="detail-table">
                        <tbody>
                          {[
                            ["Custom lead time", s.custom_lead_time],
                            ["Packing", s.packing_method],
                            ["Dispatch from", s.dispatch_city],
                          ].map(([key, val], i) => (
                            <tr key={i}><td className="dt-key">{key}</td><td className="dt-val">{val}</td></tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="platform-nudge">
                        <Shield size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1, color: "var(--blue-600)" }} />
                        <span>All buyer-supplier communication happens securely through Locofast. <a href="#enq-form" onClick={(e) => { e.preventDefault(); document.getElementById("enq-form")?.scrollIntoView({ behavior: "smooth" }); }}>Send an enquiry &rarr;</a></span>
                      </div>
                    </div>
                  </div>

                  {s.certifications?.length > 0 && (
                    <>
                      <div className="sec-label">Certifications & Compliance</div>
                      <div className="cert-wrap">
                        {s.certifications.map(cert => (
                          <span key={cert} className="cert-chip"><span className="cert-check"><CheckCircle2 size={11} /></span> {cert}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {s.description && (
                    <>
                      <div className="sec-label">About Supplier</div>
                      <p className="about-text">{s.description}</p>
                    </>
                  )}

                  {cats.length > 0 && (
                    <>
                      <div className="sec-label">Browse Related</div>
                      <div className="ilink-grid">
                        {cats.map(cat => (
                          <Link key={cat} to={`/fabrics?category=${encodeURIComponent(cat)}`} className="ilink">
                            <ChevronRight size={11} /> {cat} &middot; {s.city}
                          </Link>
                        ))}
                        <Link to={`/suppliers/${category}/${city}`} className="ilink">
                          <ChevronRight size={11} /> All {(city || "").replace(/-/g, " ")} Suppliers
                        </Link>
                      </div>
                    </>
                  )}
                </div>

                {/* ── CATALOG ── */}
                <div className={`tab-pane${activeTab === "catalog" ? " active" : ""}`} data-testid="panel-catalog">
                  <div className="filter-bar">
                    <select className="fsel" value={catFilter} onChange={e => setCatFilter(e.target.value)} data-testid="catalog-cat-filter">
                      <option value="">All Categories</option>
                      {cats.map(cat => <option key={cat} value={cat}>{cat} ({stats.category_counts[cat]})</option>)}
                    </select>
                    <select className="fsel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                      <option value="newest">Sort: Newest</option>
                      <option value="price-asc">Price: Low-High</option>
                      <option value="price-desc">Price: High-Low</option>
                    </select>
                    <label className="stock-toggle">
                      <span className="sw">
                        <input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} />
                        <span className="sw-slider" />
                      </span>
                      In-stock only
                    </label>
                  </div>

                  {filteredFabrics.length === 0 ? (
                    <div className="empty-state">
                      <Box size={40} />
                      <p>No products found</p>
                      <span>Try adjusting your filters</span>
                    </div>
                  ) : (
                    <>
                      <div className="sku-grid">
                        {displayFabrics.map(f => {
                          const qty = f.quantity_available || 0;
                          const stockLabel = qty > 100 ? "In Stock" : qty > 0 ? "Low Stock" : null;
                          const stockCls = qty > 100 ? "sk-in" : qty > 0 ? "sk-lo" : "sk-out";
                          return (
                            <Link key={f.id} to={`/fabrics/${f.id}`} className="sku-card" data-testid={`catalog-card-${f.id}`}>
                              <div className="sku-thumb">
                                {f.images?.[0] ? (
                                  <img src={f.images[0]} alt={f.name} loading="lazy" />
                                ) : (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-5)" }}>{f.category_name || "Fabric"}</span>
                                )}
                                {stockLabel && <span className={`sku-stk ${stockCls}`}>{stockLabel}</span>}
                              </div>
                              <div className="sku-body">
                                <h3 className="sku-name">{f.name}</h3>
                                {f.fabric_code && <div className="sku-code">SKU: {f.fabric_code}</div>}
                                <div className="sku-spec">
                                  {[f.composition, f.width ? `${f.width} wide` : null, f.gsm ? `${f.gsm} GSM` : null].filter(Boolean).join(" \u00B7 ")}
                                  {qty > 0 && <><br />{qty.toLocaleString()}m available</>}
                                </div>
                                <div className="sku-foot">
                                  <div className="sku-price">
                                    {f.price_per_meter ? <>{"\u20B9"}{f.price_per_meter}<span>/m</span></> : "Get Quote"}
                                  </div>
                                  {f.moq && <span className="sku-moq">MOQ {f.moq}m</span>}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      {filteredFabrics.length > 12 && !showAllFabrics && (
                        <div className="catalog-more">
                          <button className="btn-loadmore" onClick={() => setShowAllFabrics(true)}>
                            Load more SKUs ({filteredFabrics.length - 12} remaining)
                          </button>
                          <p style={{ fontSize: 11, color: "var(--ink-6)", marginTop: 8 }}>Showing 12 of {filteredFabrics.length} products</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── INVENTORY ── */}
                <div className={`tab-pane${activeTab === "inventory" ? " active" : ""}`} data-testid="panel-inventory">
                  <div className="inv-cards">
                    <div className="inv-card"><div className="inv-val">{stats.total_skus}</div><div className="inv-lbl">Total SKUs</div></div>
                    <div className="inv-card"><div className="inv-val" style={{ color: "var(--green)" }}>{stats.in_stock}</div><div className="inv-lbl">In Stock</div></div>
                    <div className="inv-card"><div className="inv-val" style={{ color: "var(--amber)" }}>{stats.low_stock}</div><div className="inv-lbl">Low Stock</div></div>
                  </div>

                  {Object.keys(stats.stock_by_category).length > 0 && (
                    <>
                      <div className="sec-label">Stock by Category</div>
                      <div style={{ marginBottom: 24 }}>
                        {Object.entries(stats.stock_by_category).sort((a, b) => b[1] - a[1]).map(([cat, qty]) => (
                          <div key={cat} className="inv-row">
                            <div className="inv-lbl2">{cat}</div>
                            <div className="inv-track"><div className="inv-fill" style={{ width: `${Math.min((qty / maxStock) * 100, 100)}%` }} /></div>
                            <div className="inv-num">{qty.toLocaleString()}m</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="sec-label">Lead Times</div>
                  <table className="cap-table">
                    <tbody>
                      {[
                        ["Monthly capacity", s.monthly_capacity || "On request"],
                        ["Standard lead time", s.standard_lead_time],
                        ["Custom order lead time", s.custom_lead_time],
                        ["Sample development", s.sample_lead_time],
                        ["Packing method", s.packing_method],
                      ].map(([key, val], i) => (
                        <tr key={i}><td className="cak">{key}</td><td className="cav">{val}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="live-row"><div className="live-dot" /> Inventory updated regularly</div>
                </div>

                {/* ── REVIEWS ── */}
                <div className={`tab-pane${activeTab === "reviews" ? " active" : ""}`} data-testid="panel-reviews">
                  <div className="rev-summary">
                    <div className="rev-score">
                      <div className="big-score">{profile.review_stats.average}</div>
                      <div className="big-stars"><StarRating rating={profile.review_stats.average} /></div>
                      <div className="score-total">{profile.review_stats.count} reviews</div>
                    </div>
                    <div className="rev-bars">
                      {[5, 4, 3, 2, 1].map(n => {
                        const count = profile.review_stats.distribution?.[String(n)] || 0;
                        const total = Math.max(profile.review_stats.count, 1);
                        return (
                          <div key={n} className="rb-row">
                            <span className="rb-num">{n}</span>
                            <span className="rb-star">&#9733;</span>
                            <div className="rb-track"><div className="rb-fill" style={{ width: `${(count / total) * 100}%`, ...(n <= 2 ? { background: "#ef4444" } : {}) }} /></div>
                            <span className="rb-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="sub-grid">
                      {Object.entries(profile.review_stats.sub_ratings).map(([key, val]) => (
                        <div key={key} className="sub-item">
                          <div className="sub-lbl">{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
                          <div className="sub-score">{val}</div>
                          <div className="sub-bar"><div className="sub-fill" style={{ width: `${(val / 5) * 100}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {profile.reviews.length === 0 ? (
                    <div className="empty-state">
                      <Star size={40} />
                      <p>No reviews yet</p>
                      <span>Be the first to review this supplier</span>
                    </div>
                  ) : (
                    profile.reviews.map((rev, i) => (
                      <div key={i} className="rev-item">
                        <div className="rev-head">
                          <div className="rev-avatar">{(rev.buyer_name || "B")[0].toUpperCase()}{(rev.buyer_name || "B").split(" ")[1]?.[0]?.toUpperCase() || ""}</div>
                          <div className="rev-meta">
                            <div className="rev-buyer">{rev.buyer_name}</div>
                            <div className="rev-co">{rev.buyer_company} <span className="vp-badge"><CheckCircle2 size={8} /> Verified</span></div>
                          </div>
                          <div>
                            <div className="rev-stars">{[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= rev.rating ? "rsf" : "rse"}>&#9733;</span>)}</div>
                            <div className="rev-date">{rev.date}</div>
                          </div>
                        </div>
                        <p className="rev-body">{rev.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* ── ORDERS & TERMS ── */}
                <div className={`tab-pane${activeTab === "orders" ? " active" : ""}`} data-testid="panel-orders">
                  <div className="terms-grid">
                    <div className="terms-block">
                      <h4>Order Terms</h4>
                      <table className="terms-table">
                        <tbody>
                          {[
                            ["Min order qty", s.moq, ""],
                            ["Payment terms", s.payment_terms, ""],
                            ["Payment modes", s.payment_modes?.join(", "), ""],
                            ["Dispatch from", s.dispatch_city, "tv-blue"],
                            ["Packing", s.packing_method, ""],
                          ].map(([key, val, cls], i) => (
                            <tr key={i}><td className="tk">{key}</td><td className={`tv ${cls}`}>{val}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="terms-block">
                      <h4>Shipping & Delivery</h4>
                      <table className="terms-table">
                        <tbody>
                          {[
                            ["Within India", "5-8 working days", ""],
                            ["Bangladesh", "7-12 days", ""],
                            ["UAE / Middle East", "10-15 days", ""],
                            ["On-time rate", `${stats.on_time_rate}%`, "tv-green"],
                          ].map(([key, val, cls], i) => (
                            <tr key={i}><td className="tk">{key}</td><td className={`tv ${cls}`}>{val}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {profile.recent_orders.length > 0 ? (
                    <>
                      <div className="sec-label">Recent Orders (Anonymised)</div>
                      <div style={{ overflowX: "auto" }}>
                        <table className="orders-table">
                          <thead><tr><th>Order ID</th><th>Product</th><th>Qty</th><th>Buyer Location</th><th>Status</th></tr></thead>
                          <tbody>
                            {profile.recent_orders.map((o, i) => (
                              <tr key={i}>
                                <td>{o.order_id}</td>
                                <td>{o.product}</td>
                                <td>{o.quantity}m</td>
                                <td>{o.buyer_location}</td>
                                <td>
                                  <span className={`sc ${o.status === "delivered" ? "sc-del" : o.status === "shipped" ? "sc-tra" : "sc-pro"}`}>
                                    {o.status?.charAt(0).toUpperCase() + o.status?.slice(1)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <Package size={40} />
                      <p>No orders yet</p>
                      <span>This supplier is newly onboarded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ SIDEBAR ═══ */}
            <aside className="sidebar">
              {/* Enquiry Form */}
              <div className="sb-card" id="enq-form">
                <h3>Connect via Locofast</h3>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--blue-50)", border: "1px solid var(--blue-100)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                  <Shield size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--blue-600)" }} />
                  <span style={{ fontSize: 11, color: "var(--blue-700)", fontWeight: 500, lineHeight: 1.5 }}>
                    All buyer-supplier communication is handled securely through Locofast. Your enquiry reaches the right team.
                  </span>
                </div>
                <form onSubmit={handleEnquiry}>
                  <div className="form-row">
                    <label className="form-lbl">Your name</label>
                    <input className="form-in" type="text" placeholder="Full name" required value={enqForm.name} onChange={e => setEnqForm(p => ({ ...p, name: e.target.value }))} data-testid="enq-name" />
                  </div>
                  <div className="form-row">
                    <label className="form-lbl">Company</label>
                    <input className="form-in" type="text" placeholder="Company / brand name" required value={enqForm.company} onChange={e => setEnqForm(p => ({ ...p, company: e.target.value }))} data-testid="enq-company" />
                  </div>
                  <div className="form-row">
                    <label className="form-lbl">Country</label>
                    <select className="form-sel" value={enqForm.country} onChange={e => setEnqForm(p => ({ ...p, country: e.target.value }))} data-testid="enq-country">
                      <option>India</option><option>Bangladesh</option><option>UAE</option>
                      <option>Sri Lanka</option><option>Vietnam</option><option>UK</option><option>USA</option><option>Other</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label className="form-lbl">Product interest</label>
                    <select className="form-sel" value={enqForm.product} onChange={e => setEnqForm(p => ({ ...p, product: e.target.value }))} data-testid="enq-product">
                      <option value="">Select product type</option>
                      {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label className="form-lbl">Approx. quantity</label>
                    <input className="form-in" type="text" placeholder="e.g. 1,000 metres" value={enqForm.quantity} onChange={e => setEnqForm(p => ({ ...p, quantity: e.target.value }))} data-testid="enq-qty" />
                  </div>
                  <div className="form-row">
                    <label className="form-lbl">Message</label>
                    <textarea className="form-ta" placeholder="GSM, width, end-use, delivery timeline..." value={enqForm.message} onChange={e => setEnqForm(p => ({ ...p, message: e.target.value }))} data-testid="enq-message" />
                  </div>
                  <button type="submit" className={`form-sub${enqSent ? " success" : ""}`} disabled={enqSending || enqSent} data-testid="enq-submit">
                    {enqSent ? (<><CheckCircle2 size={14} /> Enquiry Sent!</>) : enqSending ? "Sending..." : (<><Send size={14} /> Send Enquiry</>)}
                  </button>
                  <p className="form-note">Locofast routes your enquiry to the supplier on your behalf</p>
                </form>
              </div>

              {/* Supplier Snapshot */}
              <div className="sb-card">
                <h3>Supplier Snapshot</h3>
                <div className="qs-grid">
                  <div className="qs"><div className="qs-val">{profile.review_stats.average}&#9733;</div><div className="qs-lbl">Rating</div></div>
                  <div className="qs"><div className="qs-val">{stats.on_time_rate}%</div><div className="qs-lbl">On-time</div></div>
                  <div className="qs"><div className="qs-val">{stats.total_skus}</div><div className="qs-lbl">SKUs</div></div>
                  <div className="qs"><div className="qs-val">{s.moq || "\u2014"}</div><div className="qs-lbl">Min MOQ</div></div>
                  <div className="qs"><div className="qs-val">{stats.response_time.replace("< ", "<")}</div><div className="qs-lbl">Response</div></div>
                  <div className="qs"><div className="qs-val">{stats.years_in_business}yr</div><div className="qs-lbl">Experience</div></div>
                </div>
              </div>

              {/* Similar Suppliers */}
              {profile.similar_suppliers.length > 0 && (
                <div className="sb-card">
                  <h3>Similar {s.primary_category || "Fabric"} Suppliers</h3>
                  <div>
                    {profile.similar_suppliers.map(sim => {
                      const simCity = (sim.city || "").toLowerCase().replace(/\s+/g, "-");
                      const simCat = (sim.primary_category || "fabrics").toLowerCase().replace(/\s+/g, "-");
                      const simInitials = sim.company_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <Link key={sim.id} to={`/suppliers/${simCat}/${simCity}/${sim.slug}`} className="sim-item" data-testid={`similar-${sim.slug}`}>
                          <div className="sim-logo">
                            {sim.logo_url ? <img src={sim.logo_url.startsWith("http") ? sim.logo_url : `${API}${sim.logo_url}`} alt={sim.company_name} style={{ width: "100%", height: "100%", borderRadius: 9, objectFit: "cover" }} /> : simInitials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="sim-name">{sim.company_name}</div>
                            <div className="sim-loc">{sim.city}{sim.fabric_count > 0 ? ` \u00B7 ${sim.fabric_count} products` : ""}</div>
                          </div>
                        </Link>
                      );
                    })}
                    <Link to={`/suppliers/${category}/${city}`} className="sim-more">
                      View all {(city || "").replace(/-/g, " ")} suppliers &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>

      <Footer />
      <RFQModal open={showRfqModal} onClose={() => setShowRfqModal(false)} />

      {/* WhatsApp Float */}
      <a href="https://wa.me/91" className="wa-float" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      </a>
    </>
  );
}
