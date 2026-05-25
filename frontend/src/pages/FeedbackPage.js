/**
 * FeedbackPage
 * ────────────
 * Public route: /feedback/:orderId?r=<1-5>
 *
 * Opens from the star links in the delivery email. Hydrates the order
 * context via `GET /api/order-reviews/:orderId`, pre-selects the rating
 * the user clicked in email, then submits to `POST /api/order-reviews/submit`.
 *
 * Re-submissions are allowed within 7 days (server-enforced via
 * EDIT_WINDOW_DAYS). After that the form locks and shows the prior
 * review as read-only.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { Star, Check, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LABELS = ["", "Poor · 1/5", "Could be better · 2/5", "Decent · 3/5", "Great · 4/5", "Excellent · 5/5"];

const StarPicker = ({ value, onChange, disabled }) => (
  <div className="flex justify-center gap-2 my-4" data-testid="feedback-star-picker">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        disabled={disabled}
        onClick={() => onChange(n)}
        className={`transition-all ${disabled ? "cursor-default" : "hover:scale-110"} ${
          n <= value ? "text-amber-400" : "text-gray-200"
        }`}
        data-testid={`feedback-star-${n}`}
      >
        <Star size={44} className="fill-current" />
      </button>
    ))}
  </div>
);

const FeedbackPage = () => {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const initialRating = Math.max(0, Math.min(5, parseInt(params.get("r") || "5", 10) || 5));
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(initialRating);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/order-reviews/${orderId}`);
        if (cancelled) return;
        setOrder(data);
        if (data.existing_review) {
          setRating(data.existing_review.rating || initialRating);
          setFeedback(data.existing_review.feedback || "");
          if (!data.can_edit) setLocked(true);
        }
      } catch {
        setOrder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, initialRating]);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) {
      toast.error("Please pick a star rating first");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/order-reviews/submit`, {
        order_id: orderId,
        rating,
        feedback: feedback.trim(),
      });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't submit. Try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="text-amber-500 animate-spin" size={32} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md text-center" data-testid="feedback-not-found">
          <h1 className="text-xl font-semibold text-slate-900">Order not found</h1>
          <p className="text-sm text-slate-500 mt-2">
            We couldn't find this order. The link may be expired. Write to{" "}
            <a href="mailto:mail@locofast.com" className="text-blue-600">mail@locofast.com</a> if you need help.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <h1 className="text-center text-2xl font-extrabold text-slate-900 mb-7 tracking-tight">Locofast</h1>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center" data-testid="feedback-thanks">
            <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
              <Check size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Thank you!</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your feedback is in. We've shared it with our team to keep improving Locofast.
            </p>
            <Link
              to="/fabrics"
              className="inline-flex items-center gap-1.5 mt-6 bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-800"
              data-testid="feedback-continue-browsing"
            >
              Continue browsing <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const item = order.items?.[0] || {};
  const items = order.items || [];
  const more = items.length > 1 ? ` + ${items.length - 1} more` : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-10 px-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-center text-2xl font-extrabold text-slate-900 mb-7 tracking-tight">Locofast</h1>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7" data-testid="feedback-card">
          <h2 className="text-xl font-semibold text-slate-900">
            {locked ? "Your review" : "How was your order?"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {locked
              ? `This review is locked (older than ${order.edit_window_days} days).`
              : "Your honest feedback helps us serve you better."}
          </p>

          <div className="mt-5 flex gap-3 items-center bg-slate-50 border border-slate-100 rounded-lg p-3">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="w-12 h-12 rounded-md object-cover border border-slate-200" />
            ) : (
              <div className="w-12 h-12 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-slate-900 truncate" data-testid="feedback-order-number">
                Order {order.order_number}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {item.fabric_name || "Fabric"}{more} · ₹{Number(order.total || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          <form onSubmit={submit} data-testid="feedback-form">
            <StarPicker value={rating} onChange={setRating} disabled={locked} />
            <p className="text-center text-sm text-slate-600 font-medium mb-4" data-testid="feedback-rating-label">
              {LABELS[rating] || "Pick a rating"}
            </p>

            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Anything you'd like to share?{" "}
              <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Loved the quality, hand-feel was great…"
              rows={3}
              disabled={locked}
              maxLength={2000}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-500"
              data-testid="feedback-textarea"
            />

            {!locked && (
              <button
                type="submit"
                disabled={submitting || !rating}
                className="w-full mt-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60 hover:shadow-md transition-shadow"
                data-testid="feedback-submit"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                {submitting ? "Submitting…" : order.existing_review ? "Update feedback" : "Submit feedback"}
              </button>
            )}
          </form>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            By submitting, you confirm this feedback is honest and unincentivised.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;
