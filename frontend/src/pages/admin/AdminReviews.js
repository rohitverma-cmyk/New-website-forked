import { useState, useEffect } from "react";
import { Star, Plus, Trash2, Building2, Calendar, X } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getSellers, getReviews, createReview, deleteReview } from "../../lib/api";

const AdminReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSeller, setFilterSeller] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    seller_id: "",
    customer_name: "",
    customer_company: "",
    customer_location: "",
    rating: 5,
    review_text: "",
    review_date: new Date().toISOString().split("T")[0],
    is_verified: true,
  });

  const fetchData = async () => {
    try {
      const [sellersRes, reviewsRes] = await Promise.all([
        getSellers(true),
        getReviews(filterSeller || undefined),
      ]);
      setSellers(sellersRes.data);
      setReviews(reviewsRes.data);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterSeller]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.seller_id || !form.customer_name || !form.rating) return;
    setSubmitting(true);
    try {
      await createReview(form);
      setShowForm(false);
      setForm({ seller_id: "", customer_name: "", customer_company: "", customer_location: "", rating: 5, review_text: "", review_date: new Date().toISOString().split("T")[0], is_verified: true });
      fetchData();
    } catch (err) {
      alert("Failed to save review: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this review?")) return;
    try {
      await deleteReview(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete review");
    }
  };

  const sellerMap = {};
  sellers.forEach(s => { sellerMap[s.id] = s.company_name; });

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="admin-reviews-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="reviews-heading">Reviews CMS</h1>
            <p className="text-sm text-gray-500 mt-1">Add and manage supplier reviews from your ERP</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
            data-testid="add-review-btn"
          >
            <Plus size={16} /> Add Review
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <select
            value={filterSeller}
            onChange={e => setFilterSeller(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            data-testid="review-seller-filter"
          >
            <option value="">All Suppliers</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.company_name}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Reviews Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Star size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-semibold text-gray-700">No reviews yet</p>
            <p className="text-sm text-gray-500 mt-1">Click "Add Review" to import from your ERP</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Rating</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Review</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {reviews.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`review-row-${r.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{r.seller_name || sellerMap[r.seller_id] || r.seller_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{r.customer_name}</div>
                      {r.customer_company && <div className="text-xs text-gray-500">{r.customer_company}</div>}
                      {r.customer_location && <div className="text-xs text-gray-400">{r.customer_location}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} size={14} className={i <= r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-600 truncate">{r.review_text || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.review_date}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                        data-testid={`delete-review-${r.id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Review Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
            <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" data-testid="add-review-modal">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Add Review</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Supplier *</label>
                  <select
                    value={form.seller_id}
                    onChange={e => setForm(p => ({ ...p, seller_id: e.target.value }))}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    data-testid="review-form-seller"
                  >
                    <option value="">Select supplier</option>
                    {sellers.map(s => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Customer Name *</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
                      required
                      placeholder="e.g. FashionMark Apparels"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      data-testid="review-form-name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Company</label>
                    <input
                      type="text"
                      value={form.customer_company}
                      onChange={e => setForm(p => ({ ...p, customer_company: e.target.value }))}
                      placeholder="e.g. Stitch Label Co"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      data-testid="review-form-company"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Location</label>
                    <input
                      type="text"
                      value={form.customer_location}
                      onChange={e => setForm(p => ({ ...p, customer_location: e.target.value }))}
                      placeholder="e.g. Dhaka, Bangladesh"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      data-testid="review-form-location"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date *</label>
                    <input
                      type="date"
                      value={form.review_date}
                      onChange={e => setForm(p => ({ ...p, review_date: e.target.value }))}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      data-testid="review-form-date"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Star Rating *</label>
                  <div className="flex items-center gap-1" data-testid="review-form-stars">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, rating: i }))}
                        className="p-0.5"
                      >
                        <Star
                          size={28}
                          className={`transition ${i <= form.rating ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"}`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-sm font-bold text-gray-700">{form.rating}/5</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Review Description</label>
                  <textarea
                    value={form.review_text}
                    onChange={e => setForm(p => ({ ...p, review_text: e.target.value }))}
                    placeholder="What the customer said about this supplier..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-vertical"
                    data-testid="review-form-text"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_verified}
                    onChange={e => setForm(p => ({ ...p, is_verified: e.target.checked }))}
                    id="verified-toggle"
                    className="rounded"
                  />
                  <label htmlFor="verified-toggle" className="text-sm text-gray-600">Verified Purchase</label>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                    data-testid="review-form-submit"
                  >
                    {submitting ? "Saving..." : "Save Review"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminReviews;
