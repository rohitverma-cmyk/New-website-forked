import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import BrandLayout from "./BrandLayout";
import {
  Loader2, ArrowLeft, BadgeCheck, Calendar, Layers, Truck, Mail,
  Phone, ImageIcon, Trophy, Clock, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { fmtINR } from "../../lib/inr";

const API = process.env.REACT_APP_BACKEND_URL;

const Stat = ({ label, value }) => (
  <div>
    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    <p className="text-sm font-medium text-gray-900">{value || "—"}</p>
  </div>
);

const QuoteCard = ({ quote, unit, isWon }) => {
  const lost = quote.status === "lost";
  return (
    <div className={`border rounded-xl p-4 ${quote.is_best_price ? "border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-100" : lost ? "border-gray-200 opacity-70" : "border-gray-200 bg-white"}`} data-testid={`quote-card-${quote.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-gray-900 text-white text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full">
              <Building2 size={10} /> Vendor
            </span>
            {quote.is_best_price && !lost && (
              <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                <BadgeCheck size={10} /> Best Price
              </span>
            )}
            {quote.status === "won" && (
              <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                <Trophy size={10} /> Order placed
              </span>
            )}
            {lost && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Not selected</span>}
          </div>
          <p className="font-medium text-gray-900 mt-2">{quote.vendor_company || "Locofast Verified Mill"}</p>
          <p className="text-[11px] text-gray-500">{quote.vendor_city ? `${quote.vendor_city}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{fmtINR(quote.price_per_meter)}<span className="text-xs text-gray-500 font-normal">/{unit}</span></p>
          {quote.lead_days != null && (
            <p className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1"><Clock size={11} /> {quote.lead_days} day lead</p>
          )}
        </div>
      </div>

      {(quote.notes || quote.moq) && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1">
          {quote.moq != null && <p>MOQ: <span className="font-medium text-gray-800">{quote.moq} {unit}</span></p>}
          {quote.notes && <p>{quote.notes}</p>}
        </div>
      )}

      {!isWon && !lost && (
        <Link
          to="/rfq?from=enterprise"
          className="mt-3 inline-flex items-center justify-center gap-1.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          data-testid={`quote-contact-${quote.id}`}
        >
          Contact Locofast to proceed →
        </Link>
      )}
    </div>
  );
};

const BrandQueryDetail = () => {
  const { rfqId } = useParams();
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    fetch(`${API}/api/brand/queries/${rfqId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Not found");
        return d;
      })
      .then(setRfq)
      .catch((e) => { setError(e.message); toast.error(e.message); });
    // eslint-disable-next-line
  }, [token, rfqId]);

  if (error) {
    return (
      <BrandLayout>
        <div className="max-w-md mx-auto py-16 text-center">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Link to="/enterprise/queries" className="text-sm text-emerald-700 hover:underline">← Back to my queries</Link>
        </div>
      </BrandLayout>
    );
  }

  if (!rfq) {
    return (
      <BrandLayout>
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
      </BrandLayout>
    );
  }

  const unit = (rfq.quantity_unit || "m").toLowerCase();
  const cat = (rfq.category || "").toUpperCase();
  const compositionStr = (rfq.composition || []).map((c) => `${c.percentage}% ${c.material}`).join(", ");
  const isWon = rfq.status === "won";

  return (
    <BrandLayout>
      <Link to="/enterprise/queries" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3" data-testid="brand-query-back">
        <ArrowLeft size={14} /> Back to queries
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{cat || "Custom"} · <span className="font-mono">{rfq.rfq_number}</span></p>
            <h1 className="text-xl font-semibold text-gray-900">
              {rfq.fabric_requirement_type || rfq.knit_type || rfq.weave_type || "Custom RFQ"}
              {rfq.gsm ? <span className="text-base text-gray-500 font-normal"> · {rfq.gsm} GSM</span> : null}
              {rfq.weight_oz ? <span className="text-base text-gray-500 font-normal"> · {rfq.weight_oz} oz</span> : null}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Filed {rfq.created_at ? new Date(rfq.created_at).toLocaleString() : "—"}{rfq.full_name ? ` by ${rfq.full_name}` : ""}</p>
          </div>
          {isWon && (
            <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
              <Trophy size={12} /> Won — order placed
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <Stat label="Quantity" value={<span className="inline-flex items-center gap-1"><Layers size={11} />{rfq.quantity_label || "—"}</span>} />
          <Stat label="Required by" value={rfq.required_by ? <span className="inline-flex items-center gap-1"><Calendar size={11} />{rfq.required_by}</span> : "—"} />
          <Stat label="Color" value={rfq.color || "Any"} />
          <Stat label="Width" value={rfq.width_inches ? `${rfq.width_inches}"` : "—"} />
          <Stat label="Composition" value={compositionStr || "—"} />
          <Stat label="Finish" value={rfq.finish || "—"} />
          <Stat label="End Use" value={rfq.end_use || "—"} />
          <Stat label="Target Price" value={rfq.target_price_per_unit ? fmtINR(rfq.target_price_per_unit) + `/${unit}` : "—"} />
        </div>
        {rfq.delivery_city && (
          <p className="text-xs text-gray-600 mt-4 inline-flex items-center gap-1.5"><Truck size={11} /> Deliver to: {[rfq.delivery_city, rfq.delivery_state, rfq.delivery_pincode].filter(Boolean).join(", ")}</p>
        )}
        {(rfq.email || rfq.phone) && (
          <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
            {rfq.email && <span className="inline-flex items-center gap-1"><Mail size={11} />{rfq.email}</span>}
            {rfq.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{rfq.phone}</span>}
          </p>
        )}
        {(rfq.reference_images || []).length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><ImageIcon size={11} /> Reference Images</p>
            <div className="flex gap-2 flex-wrap">
              {rfq.reference_images.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block border border-gray-200 rounded-lg overflow-hidden">
                  <img src={u} alt={`ref-${i}`} className="w-20 h-20 object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        {rfq.message && <p className="text-xs text-gray-600 mt-3 italic border-l-2 border-emerald-300 pl-3">"{rfq.message}"</p>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Quotes received <span className="text-xs text-gray-500 font-normal">({(rfq.quotes || []).length})</span>
        </h2>
        {!isWon && (rfq.quotes || []).length > 0 && (
          <p className="text-[11px] text-gray-500">Sorted by price · Cheapest first</p>
        )}
      </div>

      {(rfq.quotes || []).length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500" data-testid="brand-quotes-empty">
          No quotes yet. Vendors typically respond within 24–48 hours. We'll email you as quotes arrive.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="brand-quotes-list">
          {rfq.quotes.map((q) => <QuoteCard key={q.id} quote={q} unit={unit} isWon={isWon} />)}
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandQueryDetail;
