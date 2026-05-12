import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Tag, Percent, DollarSign, Calendar, Users, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from "../../lib/api";
import { useConfirm } from "../../components/useConfirm";

const AdminCoupons = () => {
  const confirm = useConfirm();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    min_order_value: "",
    max_discount: "",
    usage_limit: "",
    valid_from: "",
    valid_until: "",
    is_active: true
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      const res = await getCoupons();
      setCoupons(res.data.coupons || []);
    } catch (err) {
      toast.error("Failed to load coupons");
    }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({
      code: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      min_order_value: "",
      max_discount: "",
      usage_limit: "",
      valid_from: "",
      valid_until: "",
      is_active: true
    });
  };

  const openCreateModal = () => {
    resetForm();
    setEditingCoupon(null);
    setShowModal(true);
  };

  const openEditModal = (coupon) => {
    setForm({
      code: coupon.code || "",
      description: coupon.description || "",
      discount_type: coupon.discount_type || "percentage",
      discount_value: coupon.discount_value?.toString() || "",
      min_order_value: coupon.min_order_value?.toString() || "",
      max_discount: coupon.max_discount?.toString() || "",
      usage_limit: coupon.usage_limit?.toString() || "",
      valid_from: coupon.valid_from ? coupon.valid_from.split("T")[0] : "",
      valid_until: coupon.valid_until ? coupon.valid_until.split("T")[0] : "",
      is_active: coupon.is_active !== false
    });
    setEditingCoupon(coupon);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = {
        code: form.code.trim().toUpperCase(),
        description: form.description,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value) || 0,
        min_order_value: parseFloat(form.min_order_value) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
        usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        is_active: form.is_active
      };

      if (editingCoupon) {
        await updateCoupon(editingCoupon.id, data);
        toast.success("Coupon updated successfully");
      } else {
        await createCoupon(data);
        toast.success("Coupon created successfully");
      }

      setShowModal(false);
      fetchCoupons();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save coupon");
    }
    setSubmitting(false);
  };

  const handleDelete = async (coupon) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete coupon "${coupon.code}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;

    try {
      await deleteCoupon(coupon.id);
      toast.success("Coupon deleted");
      fetchCoupons();
    } catch (err) {
      toast.error("Failed to delete coupon");
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const getCouponStatus = (coupon) => {
    if (!coupon.is_active) return { label: "Inactive", color: "bg-gray-100 text-gray-600" };
    
    const now = new Date();
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return { label: "Expired", color: "bg-red-100 text-red-600" };
    }
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return { label: "Scheduled", color: "bg-yellow-100 text-yellow-600" };
    }
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return { label: "Limit Reached", color: "bg-orange-100 text-orange-600" };
    }
    return { label: "Active", color: "bg-emerald-100 text-emerald-600" };
  };

  return (
    <AdminLayout>
      <div data-testid="admin-coupons-page">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Coupons</h1>
            <p className="text-gray-500 mt-1">Manage discount codes for your store</p>
          </div>
          <button
            onClick={openCreateModal}
            className="btn-primary inline-flex items-center gap-2"
            data-testid="add-coupon-btn"
          >
            <Plus size={18} />
            Create Coupon
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded-xl">
            <Tag className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 mb-4">No coupons yet</p>
            <button onClick={openCreateModal} className="btn-primary">
              Create First Coupon
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left p-4 font-medium text-sm">Code</th>
                  <th className="text-left p-4 font-medium text-sm">Discount</th>
                  <th className="text-left p-4 font-medium text-sm hidden md:table-cell">Min Order</th>
                  <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">Usage</th>
                  <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">Validity</th>
                  <th className="text-left p-4 font-medium text-sm">Status</th>
                  <th className="text-right p-4 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const status = getCouponStatus(coupon);
                  return (
                    <tr key={coupon.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <Tag className="text-blue-600" size={18} />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{coupon.code}</p>
                            <p className="text-sm text-gray-500 truncate max-w-[200px]">
                              {coupon.description || "No description"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          {coupon.discount_type === "percentage" ? (
                            <>
                              <Percent size={14} className="text-emerald-600" />
                              <span className="font-medium">{coupon.discount_value}%</span>
                              {coupon.max_discount && (
                                <span className="text-xs text-gray-500 ml-1">
                                  (max ₹{coupon.max_discount})
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-medium">₹{coupon.discount_value}</span>
                              <span className="text-xs text-gray-500">flat</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        {coupon.min_order_value > 0 ? (
                          <span>₹{coupon.min_order_value.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-400">No minimum</span>
                        )}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          <Users size={14} className="text-gray-400" />
                          <span>{coupon.usage_count || 0}</span>
                          {coupon.usage_limit && (
                            <span className="text-gray-400">/ {coupon.usage_limit}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell text-sm">
                        {coupon.valid_from || coupon.valid_until ? (
                          <div>
                            <span>{formatDate(coupon.valid_from)}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span>{formatDate(coupon.valid_until)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Always valid</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(coupon)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-xl font-semibold">
                  {editingCoupon ? "Edit Coupon" : "Create Coupon"}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    required
                    disabled={!!editingCoupon}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none uppercase disabled:bg-gray-50"
                    placeholder="SAVE20"
                    data-testid="coupon-code-input"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    placeholder="20% off on first order"
                  />
                </div>

                {/* Discount Type & Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Type *
                    </label>
                    <select
                      value={form.discount_type}
                      onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none bg-white"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Value *
                    </label>
                    <input
                      type="number"
                      value={form.discount_value}
                      onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                      required
                      min="0"
                      step={form.discount_type === "percentage" ? "1" : "0.01"}
                      max={form.discount_type === "percentage" ? "100" : undefined}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder={form.discount_type === "percentage" ? "20" : "500"}
                    />
                  </div>
                </div>

                {/* Min Order & Max Discount */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Order Value (₹)
                    </label>
                    <input
                      type="number"
                      value={form.min_order_value}
                      onChange={(e) => setForm({ ...form, min_order_value: e.target.value })}
                      min="0"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder="1000"
                    />
                  </div>
                  {form.discount_type === "percentage" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Discount (₹)
                      </label>
                      <input
                        type="number"
                        value={form.max_discount}
                        onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
                        min="0"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="500"
                      />
                    </div>
                  )}
                </div>

                {/* Usage Limit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usage Limit
                  </label>
                  <input
                    type="number"
                    value={form.usage_limit}
                    onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    placeholder="Leave empty for unlimited"
                  />
                </div>

                {/* Validity Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid From
                    </label>
                    <input
                      type="date"
                      value={form.valid_from}
                      onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid Until
                    </label>
                    <input
                      type="date"
                      value={form.valid_until}
                      onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      form.is_active ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        form.is_active ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">
                    {form.is_active ? "Coupon is active" : "Coupon is inactive"}
                  </span>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : editingCoupon ? "Update Coupon" : "Create Coupon"}
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

export default AdminCoupons;
