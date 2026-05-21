import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, X, Upload, Building2, MapPin, Check, ToggleLeft, ToggleRight, Eye, Search, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getSellers, getCategories, createSeller, updateSeller, deleteSeller, uploadImage } from "../../lib/api";
import { useConfirm } from "../../components/useConfirm";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminSellers = () => {
  const confirm = useConfirm();

  const navigate = useNavigate();
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Search across seller_code, company, contact name, GSTIN, city, state, phone
  // — admins use this to corroborate "which vendor is LS-X2PA8?" without
  // scrolling through dozens of cards.
  const [searchQ, setSearchQ] = useState("");

  const filteredSellers = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) =>
      [s.seller_code, s.name, s.company_name, s.gst_number, s.city, s.state, s.contact_email, s.contact_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [searchQ, sellers]);

  const emptyForm = {
    name: "",
    company_name: "",
    description: "",
    logo_url: "",
    city: "",
    state: "",
    contact_email: "",
    contact_phone: "",
    category_ids: [],
    is_active: true,
    password: "",
    established_year: "",
    monthly_capacity: "",
    employee_count: "",
    factory_size: "",
    turnover_range: "",
    certifications: "",
    export_markets: "",
    gst_number: "",
    gst_verified: false,
    gst_legal_name: "",
    gst_trade_name: "",
  };
  const [form, setForm] = useState(emptyForm);
  // GST-verification UX: holds in-flight state + the last verification
  // result so we can show the green confirmation card.
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstError, setGstError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [selRes, catRes] = await Promise.all([getSellers(showInactive), getCategories()]);
      setSellers(selRes.data);
      setCategories(catRes.data);
    } catch (err) {
      toast.error("Failed to load data");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [showInactive]);

  const toggleCategory = (categoryId) => {
    if (form.category_ids.includes(categoryId)) {
      setForm({ ...form, category_ids: form.category_ids.filter(id => id !== categoryId) });
    } else {
      setForm({ ...form, category_ids: [...form.category_ids, categoryId] });
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    setUploading(true);
    try {
      const res = await uploadImage(file);
      setForm({ ...form, logo_url: res.data.url });
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error("Failed to upload logo");
    }
    setUploading(false);
  };

  const removeLogo = () => {
    setForm({ ...form, logo_url: "" });
  };

  const openCreateModal = () => {
    setEditingSeller(null);
    setForm(emptyForm);
    setGstError("");
    setShowModal(true);
  };

  const openEditModal = (seller) => {
    setEditingSeller(seller);
    setGstError("");
    setForm({
      name: seller.name,
      company_name: seller.company_name,
      description: seller.description || "",
      logo_url: seller.logo_url || "",
      city: seller.city || "",
      state: seller.state || "",
      contact_email: seller.contact_email || "",
      contact_phone: seller.contact_phone || "",
      category_ids: seller.category_ids || [],
      is_active: seller.is_active !== false,
      established_year: seller.established_year || "",
      monthly_capacity: seller.monthly_capacity || "",
      employee_count: seller.employee_count || "",
      factory_size: seller.factory_size || "",
      turnover_range: seller.turnover_range || "",
      certifications: (seller.certifications || []).join(", "),
      export_markets: (seller.export_markets || []).join(", "),
      gst_number: seller.gst_number || "",
      gst_verified: !!seller.gst_verified,
      gst_legal_name: seller.gst_legal_name || "",
      gst_trade_name: seller.gst_trade_name || "",
    });
    setShowModal(true);
  };

  // ── GST verification ─────────────────────────────────────────────────
  // Hits Sandbox.co.in via the backend to verify the GSTIN, then auto-
  // fills company name, city, state and the legal/trade name fields.
  // Required for new seller creation; existing sellers can re-verify.
  const handleVerifyGst = async () => {
    const gstin = (form.gst_number || "").trim().toUpperCase();
    setGstError("");
    if (!gstin) { setGstError("Enter GSTIN first"); return; }
    if (gstin.length !== 15) { setGstError("GSTIN must be 15 characters"); return; }
    setGstVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/gst/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setGstError(data.message || data.detail || "GST verification failed");
        setForm((p) => ({ ...p, gst_verified: false }));
        return;
      }
      // Auto-fill from verified GST data — admin can still edit afterwards
      setForm((p) => ({
        ...p,
        gst_number: gstin,
        gst_verified: true,
        gst_legal_name: data.legal_name || "",
        gst_trade_name: data.trade_name || "",
        company_name: p.company_name || data.trade_name || data.legal_name || "",
        city: p.city || data.city || "",
        state: p.state || data.state || "",
      }));
      toast.success(`GST verified · ${data.legal_name || data.trade_name || gstin}`);
    } catch (err) {
      setGstError("Could not reach GST service. Try again.");
    } finally {
      setGstVerifying(false);
    }
  };

  const toggleSellerActive = async (seller) => {
    try {
      await updateSeller(seller.id, { is_active: !seller.is_active });
      toast.success(seller.is_active ? "Seller deactivated" : "Seller activated");
      fetchData();
    } catch (err) {
      toast.error("Failed to update seller status");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingSeller) {
      // GST verification gate — only enforced for new seller onboarding
      if (!form.gst_number) { toast.error("GST number is required"); return; }
      if (!form.gst_verified) { toast.error("Verify the GSTIN before saving"); return; }
    }
    if (!form.name || !form.company_name) {
      toast.error("Please enter name and company name");
      return;
    }

    try {
      const payload = {
        ...form,
        established_year: form.established_year ? parseInt(form.established_year) : null,
        certifications: form.certifications ? form.certifications.split(",").map(s => s.trim()).filter(Boolean) : [],
        export_markets: form.export_markets ? form.export_markets.split(",").map(s => s.trim()).filter(Boolean) : [],
      };
      if (editingSeller) {
        await updateSeller(editingSeller.id, payload);
        toast.success("Seller updated");
      } else {
        await createSeller(payload);
        toast.success("Seller created");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save seller");
    }
  };

  const handleDelete = async (seller) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${seller.company_name}"? Fabrics associated with this seller will no longer show seller info.`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteSeller(seller.id);
      toast.success("Seller deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete seller");
    }
  };

  const getLocationString = (seller) => {
    const parts = [seller.city, seller.state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : seller.location || '';
  };

  return (
    <AdminLayout>
      <div data-testid="admin-sellers-page">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <h1 className="text-3xl font-semibold">Sellers</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show inactive
            </label>
            <button onClick={openCreateModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-seller-btn">
              <Plus size={18} />
              Add Seller
            </button>
          </div>
        </div>

        {/* Vendor search bar — accepts seller code (LS-XXXXX), company name,
            contact name, GSTIN, city, state, phone, or email. Filters the
            list client-side so admins can corroborate "which vendor is
            LS-X2PA8?" instantly without scrolling. */}
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by seller code (e.g. LS-X2PA8), company, GSTIN, city, contact…"
              className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
              data-testid="seller-search-input"
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                data-testid="seller-search-clear"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {searchQ && (
            <span className="text-xs text-gray-500" data-testid="seller-search-count">
              {filteredSellers.length} of {sellers.length} match
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 animate-pulse rounded p-6">
                <div className="w-16 h-16 bg-gray-200 rounded-full mb-4" />
                <div className="h-5 bg-gray-200 w-2/3 rounded mb-2" />
                <div className="h-4 bg-gray-200 w-full rounded" />
              </div>
            ))}
          </div>
        ) : sellers.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded">
            <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No sellers yet</p>
            <button onClick={openCreateModal} className="btn-primary">Add First Seller</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="sellers-grid">
            {filteredSellers.map((seller) => (
              <div key={seller.id} className={`bg-white border rounded p-6 ${seller.is_active === false ? 'border-gray-300 opacity-60' : 'border-gray-100'}`} data-testid={`seller-card-${seller.id}`}>
                <div className="flex items-start gap-4 mb-4">
                  {seller.logo_url ? (
                    <img
                      src={seller.logo_url}
                      alt={seller.company_name}
                      className="w-16 h-16 object-cover rounded-full border border-gray-100"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-[#2563EB] rounded-full flex items-center justify-center text-white text-xl font-semibold">
                      {seller.company_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg truncate">{seller.company_name}</h3>
                      {seller.is_active === false && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">Inactive</span>
                      )}
                      {seller.gst_verified ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded inline-flex items-center gap-1 border border-emerald-200" data-testid={`seller-gst-verified-${seller.id}`}>
                          <ShieldCheck size={11} /> GST Verified
                        </span>
                      ) : seller.gst_number ? (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded inline-flex items-center gap-1 border border-amber-200" data-testid={`seller-gst-unverified-${seller.id}`}>
                          <AlertTriangle size={11} /> GST not verified
                        </span>
                      ) : null}
                    </div>
                    <p className="text-gray-500 text-sm">{seller.name}</p>
                    {seller.seller_code && (
                      <p className="text-[#2563EB] text-xs font-mono">{seller.seller_code}</p>
                    )}
                    {getLocationString(seller) && (
                      <p className="text-gray-400 text-sm flex items-center gap-1">
                        <MapPin size={12} />
                        {getLocationString(seller)}
                      </p>
                    )}
                  </div>
                </div>
                
                {seller.description && (
                  <p className="text-gray-600 text-sm line-clamp-2 mb-3">{seller.description}</p>
                )}

                {seller.category_names && seller.category_names.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {seller.category_names.map((catName, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                        {catName}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => toggleSellerActive(seller)}
                    className={`p-2 transition-colors ${seller.is_active !== false ? 'text-emerald-600 hover:text-emerald-700' : 'text-gray-400 hover:text-gray-600'}`}
                    title={seller.is_active !== false ? "Deactivate seller" : "Activate seller"}
                    data-testid={`toggle-seller-${seller.id}`}
                  >
                    {seller.is_active !== false ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    onClick={() => navigate(`/admin/sellers/${seller.id}`)}
                    className="flex-1 btn-primary text-sm py-2 inline-flex items-center justify-center gap-2"
                    data-testid={`view-seller-${seller.id}`}
                  >
                    <Eye size={14} />
                    View
                  </button>
                  <button
                    onClick={() => openEditModal(seller)}
                    className="btn-secondary text-sm py-2 px-3 inline-flex items-center justify-center gap-1"
                    data-testid={`edit-seller-${seller.id}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(seller)}
                    className="btn-secondary text-sm py-2 px-3 inline-flex items-center justify-center gap-1 hover:border-red-500 hover:text-red-500"
                    data-testid={`delete-seller-${seller.id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="seller-modal">
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingSeller ? "Edit Seller" : "Add Seller"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* ── GST Verification Gate ──────────────────────────────
                   Sellers MUST be onboarded with a verified GSTIN. Auto-
                   pulls the legal/trade name + city/state from Sandbox.
                   ──────────────────────────────────────────────────── */}
                <div
                  className={`border rounded-lg p-4 ${form.gst_verified ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}
                  data-testid="seller-gst-card"
                >
                  <div className="flex items-start gap-2 mb-3">
                    <ShieldCheck size={18} className={form.gst_verified ? "text-emerald-600" : "text-amber-600"} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        Step 1 · Verify GST <span className="text-red-500">*</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Required to onboard a seller. Pulls legal name, trade name and registered address from the GST registry.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.gst_number}
                      onChange={(e) => setForm({
                        ...form,
                        gst_number: e.target.value.toUpperCase(),
                        // Any edit invalidates the previous verification
                        gst_verified: false,
                        gst_legal_name: e.target.value === form.gst_number ? form.gst_legal_name : "",
                        gst_trade_name: e.target.value === form.gst_number ? form.gst_trade_name : "",
                      })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded font-mono uppercase tracking-wide text-sm focus:border-[#2563EB] focus:outline-none"
                      placeholder="e.g. 24AABCB1234C1Z5"
                      maxLength={15}
                      disabled={gstVerifying}
                      data-testid="seller-gst-number"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyGst}
                      disabled={gstVerifying || form.gst_verified || !form.gst_number}
                      className={`px-4 py-2 rounded text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${form.gst_verified ? "bg-emerald-600 text-white cursor-default" : "bg-[#2563EB] text-white hover:bg-blue-600 disabled:opacity-50"}`}
                      data-testid="seller-gst-verify-btn"
                    >
                      {gstVerifying ? <><Loader2 size={14} className="animate-spin" /> Verifying…</>
                        : form.gst_verified ? <><Check size={14} /> Verified</>
                        : <>Verify GST</>}
                    </button>
                  </div>
                  {gstError && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600" data-testid="seller-gst-error">
                      <AlertTriangle size={12} /> {gstError}
                    </div>
                  )}
                  {form.gst_verified && (form.gst_legal_name || form.gst_trade_name) && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-white border border-emerald-200 rounded p-3" data-testid="seller-gst-result">
                      {form.gst_legal_name && <div><span className="text-gray-500">Legal name: </span><span className="font-medium text-gray-900">{form.gst_legal_name}</span></div>}
                      {form.gst_trade_name && <div><span className="text-gray-500">Trade name: </span><span className="font-medium text-gray-900">{form.gst_trade_name}</span></div>}
                      {form.city && <div><span className="text-gray-500">City: </span><span className="font-medium text-gray-900">{form.city}</span></div>}
                      {form.state && <div><span className="text-gray-500">State: </span><span className="font-medium text-gray-900">{form.state}</span></div>}
                    </div>
                  )}
                </div>

                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Company Logo</label>
                  <div className="flex items-center gap-4">
                    {form.logo_url ? (
                      <div className="relative">
                        <img 
                          src={form.logo_url} 
                          alt="Logo preview" 
                          className="w-20 h-20 object-cover rounded-full border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                          aria-label="Remove logo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:border-[#2563EB] transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={uploading}
                          data-testid="seller-logo-upload"
                        />
                        {uploading ? (
                          <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload size={20} className="text-gray-400" />
                        )}
                      </label>
                    )}
                    <div className="text-sm text-gray-500">
                      <p>Upload company logo</p>
                      <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Contact Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="Rajesh Kumar"
                      required
                      data-testid="seller-name-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Company Name *</label>
                    <input
                      type="text"
                      value={form.company_name}
                      onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="ABC Textiles"
                      required
                      data-testid="seller-company-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                    placeholder="Brief description of the company..."
                    data-testid="seller-description-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="Mumbai"
                      data-testid="seller-city-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">State</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="Maharashtra"
                      data-testid="seller-state-input"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Categories (product specializations)</label>
                  <div className="flex flex-wrap gap-2" data-testid="seller-categories">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`px-3 py-1.5 rounded border text-sm flex items-center gap-1.5 transition-all ${
                          form.category_ids.includes(cat.id)
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {form.category_ids.includes(cat.id) && <Check size={14} />}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select fabric categories this seller specializes in</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="contact@company.com"
                      data-testid="seller-email-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder="+91 98765 43210"
                      data-testid="seller-phone-input"
                    />
                  </div>
                </div>

                {/* Vendor Portal Access */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-medium mb-2">
                    Vendor Portal Password {editingSeller ? "(leave blank to keep current)" : "*"}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder={editingSeller ? "Enter new password to change" : "Set password for vendor login"}
                    required={!editingSeller}
                    data-testid="seller-password-input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Vendor can login at <span className="text-blue-600">/vendor/login</span> with their email and this password
                  </p>
                </div>

                {/* Additional Fields */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold text-gray-800 mb-3">Additional Fields</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Established Year</label>
                      <input type="number" value={form.established_year} onChange={e => setForm({ ...form, established_year: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="2005" data-testid="seller-established-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Capacity</label>
                      <input type="text" value={form.monthly_capacity} onChange={e => setForm({ ...form, monthly_capacity: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="1,20,000m/month" data-testid="seller-capacity-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Employee Count</label>
                      <input type="text" value={form.employee_count} onChange={e => setForm({ ...form, employee_count: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="150-200" data-testid="seller-employees-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Factory Size</label>
                      <input type="text" value={form.factory_size} onChange={e => setForm({ ...form, factory_size: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="25,000 sq ft" data-testid="seller-factory-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Annual Turnover</label>
                      <input type="text" value={form.turnover_range} onChange={e => setForm({ ...form, turnover_range: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="10-50 Crore" data-testid="seller-turnover-input" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Certifications <span className="text-gray-400">(comma-separated)</span></label>
                    <input type="text" value={form.certifications} onChange={e => setForm({ ...form, certifications: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="GOTS, OEKO-TEX, ISO 9001" data-testid="seller-certs-input" />
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Export Markets <span className="text-gray-400">(comma-separated)</span></label>
                    <input type="text" value={form.export_markets} onChange={e => setForm({ ...form, export_markets: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="Bangladesh, UAE, EU" data-testid="seller-exports-input" />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!editingSeller && !form.gst_verified}
                    title={!editingSeller && !form.gst_verified ? "Verify GST before saving" : ""}
                    data-testid="save-seller-btn"
                  >
                    {editingSeller ? "Update" : "Create Seller"}
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

export default AdminSellers;
