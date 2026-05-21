import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, X, Upload, Check, Package, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import PickupAddressesPanel from "../../components/admin/PickupAddressesPanel";
import { getSeller, updateSeller, getCategories, getFabrics, uploadImage, approveFabric, rejectFabric, deleteFabric } from "../../lib/api";
import { useConfirm } from "../../components/useConfirm";

const AdminSellerDetail = () => {
  const confirm = useConfirm();

  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);

  // Profile tab state
  const [editingProfile, setEditingProfile] = useState(false);
  const [categories, setCategories] = useState([]);
  const [uploading, setUploading] = useState(false);
  const emptyForm = {
    name: "", company_name: "", description: "", logo_url: "",
    city: "", state: "", contact_email: "", contact_phone: "",
    category_ids: [], is_active: true, password: "",
    established_year: "", monthly_capacity: "", employee_count: "",
    factory_size: "", turnover_range: "", certifications: "",
    export_markets: "", gst_number: "",
  };
  const [profileForm, setProfileForm] = useState(emptyForm);

  // SKUs tab state
  const [fabrics, setFabrics] = useState([]);
  const [fabricsLoading, setFabricsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const fetchSeller = useCallback(async () => {
    try {
      const res = await getSeller(id);
      setSeller(res.data);
    } catch {
      toast.error("Seller not found");
      navigate("/admin/sellers");
    }
  }, [id, navigate]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await getCategories();
      setCategories(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchFabrics = useCallback(async () => {
    setFabricsLoading(true);
    try {
      const res = await getFabrics({ seller_id: id, limit: 1000, include_pending: true });
      setFabrics(res.data);
    } catch {
      toast.error("Failed to load SKUs");
    }
    setFabricsLoading(false);
  }, [id]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchSeller(), fetchCategories()]);
      setLoading(false);
    };
    init();
  }, [fetchSeller, fetchCategories]);

  useEffect(() => {
    if (activeTab === "skus") fetchFabrics();
  }, [activeTab, fetchFabrics]);

  // Profile helpers
  const startEditing = () => {
    setProfileForm({
      name: seller.name || "",
      company_name: seller.company_name || "",
      description: seller.description || "",
      logo_url: seller.logo_url || "",
      city: seller.city || "",
      state: seller.state || "",
      contact_email: seller.contact_email || "",
      contact_phone: seller.contact_phone || "",
      category_ids: seller.category_ids || [],
      is_active: seller.is_active !== false,
      password: "",
      established_year: seller.established_year || "",
      monthly_capacity: seller.monthly_capacity || "",
      employee_count: seller.employee_count || "",
      factory_size: seller.factory_size || "",
      turnover_range: seller.turnover_range || "",
      certifications: (seller.certifications || []).join(", "),
      export_markets: (seller.export_markets || []).join(", "),
      gst_number: seller.gst_number || "",
    });
    setEditingProfile(true);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setProfileForm({ ...profileForm, logo_url: res.data.url });
      toast.success("Logo uploaded");
    } catch { toast.error("Failed to upload logo"); }
    setUploading(false);
  };

  const toggleCategory = (catId) => {
    setProfileForm(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(catId)
        ? prev.category_ids.filter(c => c !== catId)
        : [...prev.category_ids, catId]
    }));
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profileForm.name || !profileForm.company_name) {
      toast.error("Name and Company Name are required");
      return;
    }
    try {
      const payload = {
        ...profileForm,
        established_year: profileForm.established_year ? parseInt(profileForm.established_year) : null,
        certifications: profileForm.certifications ? profileForm.certifications.split(",").map(s => s.trim()).filter(Boolean) : [],
        export_markets: profileForm.export_markets ? profileForm.export_markets.split(",").map(s => s.trim()).filter(Boolean) : [],
      };
      await updateSeller(id, payload);
      toast.success("Seller updated");
      setEditingProfile(false);
      fetchSeller();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    }
  };

  const toggleSellerActive = async () => {
    try {
      await updateSeller(id, { is_active: !seller.is_active });
      toast.success(seller.is_active ? "Seller deactivated" : "Seller activated");
      fetchSeller();
    } catch { toast.error("Failed to update status"); }
  };

  // SKU helpers
  const handleApprove = async (fabric) => {
    try {
      await approveFabric(fabric.id);
      toast.success(`"${fabric.name}" approved`);
      fetchFabrics();
    } catch { toast.error("Failed to approve"); }
  };

  const handleReject = async (fabric) => {
    if (!(await confirm({ title: "Confirm action", message: `Reject "${fabric.name}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await rejectFabric(fabric.id);
      toast.success("Fabric rejected");
      fetchFabrics();
    } catch { toast.error("Failed to reject"); }
  };

  const handleDeleteFabric = async (fabric) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${fabric.name}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteFabric(fabric.id);
      toast.success("Fabric deleted");
      fetchFabrics();
    } catch { toast.error("Failed to delete"); }
  };

  const filteredFabrics = fabrics.filter(f => {
    const matchSearch = !searchQuery.trim() || 
      f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.seller_sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.fabric_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !filterStatus || f.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    all: fabrics.length,
    pending: fabrics.filter(f => f.status === "pending").length,
    approved: fabrics.filter(f => f.status === "approved").length,
    rejected: fabrics.filter(f => f.status === "rejected").length,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 w-48 rounded" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </AdminLayout>
    );
  }

  if (!seller) return null;

  return (
    <AdminLayout>
      <div data-testid="admin-seller-detail-page">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate("/admin/sellers")} className="p-2 hover:bg-gray-100 rounded transition-colors" data-testid="back-to-sellers-btn">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-4 flex-1">
            {seller.logo_url ? (
              <img src={seller.logo_url} alt={seller.company_name} className="w-14 h-14 object-cover rounded-full border border-gray-200" />
            ) : (
              <div className="w-14 h-14 bg-[#2563EB] rounded-full flex items-center justify-center text-white text-xl font-semibold">
                {seller.company_name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold" data-testid="seller-detail-name">{seller.company_name}</h1>
                <span className={`px-2 py-0.5 text-xs rounded-full ${seller.is_active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {seller.is_active !== false ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-gray-500 text-sm">{seller.name} {seller.seller_code && <span className="text-[#2563EB] font-mono ml-2">{seller.seller_code}</span>}</p>
            </div>
          </div>
          <button
            onClick={toggleSellerActive}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${seller.is_active !== false ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
            data-testid="toggle-active-btn"
          >
            {seller.is_active !== false ? "Deactivate" : "Activate"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6" data-testid="seller-detail-tabs">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "profile" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-profile"
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab("skus")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "skus" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-skus"
          >
            SKUs
            {statusCounts.pending > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">{statusCounts.pending} pending</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "finance" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-finance"
          >
            Finance & Payouts
          </button>
          <button
            onClick={() => setActiveTab("pickup")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "pickup" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-pickup"
          >
            Pickup Addresses
          </button>
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div data-testid="profile-tab-content">
            {!editingProfile ? (
              <div>
                <div className="flex justify-end mb-4">
                  <button onClick={startEditing} className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="edit-profile-btn">
                    <Pencil size={16} /> Edit Profile
                  </button>
                </div>

                {/* Profile View */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Basic Info Card */}
                  <div className="bg-white border border-gray-100 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Basic Information</h3>
                    <div className="space-y-3">
                      <ProfileField label="Contact Name" value={seller.name} />
                      <ProfileField label="Company Name" value={seller.company_name} />
                      <ProfileField label="Description" value={seller.description} />
                      <ProfileField label="Location" value={[seller.city, seller.state].filter(Boolean).join(", ")} />
                      <ProfileField label="Email" value={seller.contact_email} />
                      <ProfileField label="Phone" value={seller.contact_phone} />
                      <ProfileField label="GST Number" value={seller.gst_number} />
                    </div>
                  </div>

                  {/* Business Info Card */}
                  <div className="bg-white border border-gray-100 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Business Details</h3>
                    <div className="space-y-3">
                      <ProfileField label="Established" value={seller.established_year} />
                      <ProfileField label="Monthly Capacity" value={seller.monthly_capacity} />
                      <ProfileField label="Employees" value={seller.employee_count} />
                      <ProfileField label="Factory Size" value={seller.factory_size} />
                      <ProfileField label="Annual Turnover" value={seller.turnover_range} />
                      <ProfileField label="Certifications" value={(seller.certifications || []).join(", ")} />
                      <ProfileField label="Export Markets" value={(seller.export_markets || []).join(", ")} />
                    </div>
                  </div>

                  {/* Categories Card */}
                  <div className="bg-white border border-gray-100 rounded-lg p-6 lg:col-span-2">
                    <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                    <div className="flex flex-wrap gap-2">
                      {seller.category_names && seller.category_names.length > 0 ? (
                        seller.category_names.map((name, idx) => (
                          <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded">{name}</span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">No categories assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="bg-white border border-gray-100 rounded-lg p-6 lg:col-span-2">
                    <h3 className="font-semibold text-gray-900 mb-4">Inventory Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Total SKUs" value={statusCounts.all} />
                      <StatCard label="Live" value={statusCounts.approved} color="emerald" />
                      <StatCard label="Pending" value={statusCounts.pending} color="yellow" />
                      <StatCard label="Rejected" value={statusCounts.rejected} color="red" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Edit Profile Form */
              <form onSubmit={handleProfileSave} className="bg-white border border-gray-100 rounded-lg p-6 max-w-2xl" data-testid="edit-profile-form">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg">Edit Seller Profile</h3>
                  <button type="button" onClick={() => setEditingProfile(false)} className="p-2 text-gray-500 hover:text-gray-900">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Logo */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Logo</label>
                    <div className="flex items-center gap-4">
                      {profileForm.logo_url ? (
                        <div className="relative">
                          <img src={profileForm.logo_url} alt="Logo" className="w-20 h-20 object-cover rounded-full border" />
                          <button type="button" onClick={() => setProfileForm({ ...profileForm, logo_url: "" })} className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={14} /></button>
                        </div>
                      ) : (
                        <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:border-[#2563EB]">
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
                          {uploading ? <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" /> : <Upload size={20} className="text-gray-400" />}
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Name *</label>
                      <input type="text" value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" required data-testid="edit-seller-name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Company Name *</label>
                      <input type="text" value={profileForm.company_name} onChange={e => setProfileForm({ ...profileForm, company_name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" required data-testid="edit-seller-company" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea value={profileForm.description} onChange={e => setProfileForm({ ...profileForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">City</label>
                      <input type="text" value={profileForm.city} onChange={e => setProfileForm({ ...profileForm, city: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">State</label>
                      <input type="text" value={profileForm.state} onChange={e => setProfileForm({ ...profileForm, state: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input type="email" value={profileForm.contact_email} onChange={e => setProfileForm({ ...profileForm, contact_email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phone</label>
                      <input type="tel" value={profileForm.contact_phone} onChange={e => setProfileForm({ ...profileForm, contact_phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" />
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Categories</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(cat => (
                        <button key={cat.id} type="button" onClick={() => toggleCategory(cat.id)}
                          className={`px-3 py-1.5 rounded border text-sm flex items-center gap-1.5 transition-all ${profileForm.category_ids.includes(cat.id) ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                          {profileForm.category_ids.includes(cat.id) && <Check size={14} />}
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Password */}
                  <div className="border-t border-gray-100 pt-4">
                    <label className="block text-sm font-medium mb-1">Vendor Portal Password <span className="text-gray-400">(leave blank to keep current)</span></label>
                    <input type="password" value={profileForm.password} onChange={e => setProfileForm({ ...profileForm, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded" placeholder="Enter new password to change" />
                  </div>

                  {/* Additional Fields */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">Additional Fields</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Established Year</label>
                        <input type="number" value={profileForm.established_year} onChange={e => setProfileForm({ ...profileForm, established_year: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="2005" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">GST Number</label>
                        <input type="text" value={profileForm.gst_number} onChange={e => setProfileForm({ ...profileForm, gst_number: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="24AABCS1429B1Z5" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Capacity</label>
                        <input type="text" value={profileForm.monthly_capacity} onChange={e => setProfileForm({ ...profileForm, monthly_capacity: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="1,20,000m/month" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Employee Count</label>
                        <input type="text" value={profileForm.employee_count} onChange={e => setProfileForm({ ...profileForm, employee_count: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="150-200" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Factory Size</label>
                        <input type="text" value={profileForm.factory_size} onChange={e => setProfileForm({ ...profileForm, factory_size: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="25,000 sq ft" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Annual Turnover</label>
                        <input type="text" value={profileForm.turnover_range} onChange={e => setProfileForm({ ...profileForm, turnover_range: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="10-50 Crore" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Certifications (comma-separated)</label>
                      <input type="text" value={profileForm.certifications} onChange={e => setProfileForm({ ...profileForm, certifications: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="GOTS, OEKO-TEX, ISO 9001" />
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Export Markets (comma-separated)</label>
                      <input type="text" value={profileForm.export_markets} onChange={e => setProfileForm({ ...profileForm, export_markets: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="Bangladesh, UAE, EU" />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setEditingProfile(false)} className="btn-secondary flex-1">Cancel</button>
                    <button type="submit" className="btn-primary flex-1" data-testid="save-profile-btn">Save Changes</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* SKUs Tab */}
        {activeTab === "skus" && (
          <div data-testid="skus-tab-content">
            {/* Search and Filters */}
            <div className="bg-white border border-gray-100 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, SKU, code..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    data-testid="sku-search-input"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm"
                  data-testid="sku-status-filter"
                >
                  <option value="">All Status ({statusCounts.all})</option>
                  <option value="pending">Pending ({statusCounts.pending})</option>
                  <option value="approved">Approved ({statusCounts.approved})</option>
                  <option value="rejected">Rejected ({statusCounts.rejected})</option>
                </select>
                <span className="text-sm text-gray-500">{filteredFabrics.length} fabrics</span>
              </div>
            </div>

            {/* Fabrics Table */}
            {fabricsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-white p-4 border border-gray-100 animate-pulse flex gap-4 rounded">
                    <div className="w-12 h-12 bg-gray-200 rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 w-1/3 rounded" />
                      <div className="h-3 bg-gray-200 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredFabrics.length === 0 ? (
              <div className="text-center py-16 bg-white border border-gray-100 rounded-lg">
                <Package size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">{fabrics.length === 0 ? "No SKUs uploaded by this seller yet" : "No fabrics match your filters"}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-lg overflow-hidden" data-testid="skus-table">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left p-4 font-medium text-sm text-gray-600">Fabric</th>
                      <th className="text-left p-4 font-medium text-sm text-gray-600 hidden md:table-cell">Category</th>
                      <th className="text-left p-4 font-medium text-sm text-gray-600 hidden lg:table-cell">GSM</th>
                      <th className="text-left p-4 font-medium text-sm text-gray-600">Availability</th>
                      <th className="text-left p-4 font-medium text-sm text-gray-600">Status</th>
                      <th className="text-right p-4 font-medium text-sm text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFabrics.map(fabric => (
                      <tr key={fabric.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50" data-testid={`sku-row-${fabric.id}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 overflow-hidden flex-shrink-0 rounded">
                              <img src={fabric.images?.[0] || "https://via.placeholder.com/40"} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{fabric.name}</p>
                              <p className="text-xs text-gray-500">
                                {fabric.seller_sku && <span className="text-blue-600 font-mono mr-2">{fabric.seller_sku}</span>}
                                {fabric.fabric_code && <span className="text-gray-400 font-mono">{fabric.fabric_code}</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 hidden md:table-cell text-sm text-gray-600">{fabric.category_name || "-"}</td>
                        <td className="p-4 hidden lg:table-cell text-sm font-mono">{fabric.gsm || "-"}</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(fabric.availability) ? fabric.availability : []).map((avail, idx) => (
                              <span key={idx} className={`px-2 py-0.5 text-xs rounded ${avail === "Sample" ? "bg-blue-50 text-blue-700" : avail === "Bulk" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                {avail}
                              </span>
                            ))}
                            {(!fabric.availability || fabric.availability.length === 0) && <span className="text-gray-400 text-xs">-</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            fabric.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                            fabric.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                            fabric.status === "rejected" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {fabric.status === "approved" ? "Live" : fabric.status === "pending" ? "Pending" : fabric.status === "rejected" ? "Rejected" : "Draft"}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {fabric.status === "pending" && (
                              <>
                                <button onClick={() => handleApprove(fabric)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Approve" data-testid={`approve-sku-${fabric.id}`}>
                                  <Check size={16} />
                                </button>
                                <button onClick={() => handleReject(fabric)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Reject" data-testid={`reject-sku-${fabric.id}`}>
                                  <X size={16} />
                                </button>
                              </>
                            )}
                            <button onClick={() => handleDeleteFabric(fabric)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete" data-testid={`delete-sku-${fabric.id}`}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Finance & Payouts Tab */}
        {activeTab === "finance" && (
          <FinanceTab seller={seller} onSaved={fetchSeller} />
        )}

        {/* Pickup Addresses Tab */}
        {activeTab === "pickup" && (
          <PickupAddressesPanel sellerId={seller.id} />
        )}
      </div>
    </AdminLayout>
  );
};

// ─── Finance tab (vendor payout-related fields) ─────────────────
const FinanceTab = ({ seller, onSaved }) => {
  const [form, setForm] = useState({
    payment_terms: seller?.payment_terms || "",
    advance_pct: seller?.advance_pct ?? 0,
    bank_account_name: seller?.bank_account_name || "",
    bank_account_no: seller?.bank_account_no || "",
    ifsc_code: seller?.ifsc_code || "",
    upi_id: seller?.upi_id || "",
    pan_number: seller?.pan_number || "",
  });
  // Pickup ("Ship-From") form is saved through the standard
  // PUT /api/sellers/{id} endpoint (admin only), kept separate from
  // the finance form because it's edited by a different team.
  const [pickup, setPickup] = useState({
    pickup_address: seller?.pickup_address || "",
    pickup_city: seller?.pickup_city || seller?.city || "",
    pickup_state: seller?.pickup_state || seller?.state || "",
    pickup_pincode: seller?.pickup_pincode || "",
    pickup_contact_name: seller?.pickup_contact_name || seller?.name || "",
    pickup_contact_phone: seller?.pickup_contact_phone || seller?.contact_phone || "",
    shiprocket_pickup_nickname: seller?.shiprocket_pickup_nickname || "",
  });
  const [savingPickup, setSavingPickup] = useState(false);
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem("locofast_token");
  const API = process.env.REACT_APP_BACKEND_URL;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/payouts/vendors/${seller.id}/finance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const { toast } = await import("sonner");
      toast.success("Finance details updated");
      onSaved?.();
    } catch (e) {
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed");
    }
    setSaving(false);
  };

  const savePickup = async () => {
    setSavingPickup(true);
    try {
      const res = await fetch(`${API}/api/sellers/${seller.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(pickup),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const { toast } = await import("sonner");
      toast.success("Pickup address updated — next Shiprocket shipment will use this");
      onSaved?.();
    } catch (e) {
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed");
    }
    setSavingPickup(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-3xl" data-testid="finance-tab-content">
      <h2 className="font-semibold text-gray-900 mb-1">Payment terms & payout details</h2>
      <p className="text-xs text-gray-500 mb-5">Used by the accounts team to settle vendor dues. Advances can only be recorded if "Advance" is in the payment terms.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Payment Terms</label>
          <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white" data-testid="finance-payment-terms">
            <option value="">— Not set —</option>
            <option value="Advance 100%">Advance 100%</option>
            <option value="Advance 50% + 50% on dispatch">Advance 50% + 50% on dispatch</option>
            <option value="Advance 30% + 70% on dispatch">Advance 30% + 70% on dispatch</option>
            <option value="Net 7">Net 7 days</option>
            <option value="Net 15">Net 15 days</option>
            <option value="Net 30">Net 30 days</option>
            <option value="Net 45">Net 45 days</option>
            <option value="Net 60">Net 60 days</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Advance %</label>
          <input type="number" min="0" max="100" value={form.advance_pct} onChange={(e) => setForm({ ...form, advance_pct: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g. 50" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Bank Account Holder</label>
          <input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Account Number</label>
          <input value={form.bank_account_no} onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">IFSC Code</label>
          <input value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg uppercase" placeholder="e.g. SBIN0001234" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">UPI ID</label>
          <input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g. vendor@hdfc" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-gray-700 mb-1 block">PAN (mandatory for TDS deduction over ₹50k)</label>
          <input value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg uppercase" placeholder="ABCDE1234F" maxLength={10} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" data-testid="finance-save-btn">
          {saving ? "Saving…" : "Save finance details"}
        </button>
      </div>

      {/* ── Pickup / Ship-From — drives Shiprocket pickup_location ── */}
      <div className="mt-8 border-t pt-6" data-testid="pickup-section">
        <h2 className="font-semibold text-gray-900 mb-1">Pickup address (Ship-From)</h2>
        <p className="text-xs text-gray-500 mb-5">
          Used as the Shiprocket pickup location for orders fulfilled by this vendor. If the Shiprocket nickname is blank, a new pickup location will be auto-registered on the next shipment push using these fields.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-700 mb-1 block">Street Address</label>
            <input value={pickup.pickup_address} onChange={(e) => setPickup({ ...pickup, pickup_address: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Plot/Building, Street, Area" data-testid="pickup-address-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">City</label>
            <input value={pickup.pickup_city} onChange={(e) => setPickup({ ...pickup, pickup_city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" data-testid="pickup-city-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">State</label>
            <input value={pickup.pickup_state} onChange={(e) => setPickup({ ...pickup, pickup_state: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" data-testid="pickup-state-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">PIN Code</label>
            <input value={pickup.pickup_pincode} onChange={(e) => setPickup({ ...pickup, pickup_pincode: e.target.value.replace(/\D/g, "") })} maxLength={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg" data-testid="pickup-pincode-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Pickup Contact Name</label>
            <input value={pickup.pickup_contact_name} onChange={(e) => setPickup({ ...pickup, pickup_contact_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Pickup Contact Phone</label>
            <input value={pickup.pickup_contact_phone} onChange={(e) => setPickup({ ...pickup, pickup_contact_phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Shiprocket Pickup Nickname
              <span className="ml-2 text-[10px] text-gray-500 font-normal">(leave blank to auto-create)</span>
            </label>
            <input value={pickup.shiprocket_pickup_nickname} onChange={(e) => setPickup({ ...pickup, shiprocket_pickup_nickname: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-xs" placeholder="e.g. VND-LS-ZW7NB" data-testid="pickup-nickname-input" />
            <p className="text-[11px] text-gray-500 mt-1">Must match a registered pickup location in Shiprocket dashboard. Auto-generated as "VND-{`{seller_code}`}" if blank.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={savePickup} disabled={savingPickup} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50" data-testid="pickup-save-btn">
            {savingPickup ? "Saving…" : "Save pickup address"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper components
const ProfileField = ({ label, value }) => (
  <div className="flex items-start gap-3">
    <span className="text-gray-500 text-sm w-36 flex-shrink-0">{label}</span>
    <span className="text-gray-900 text-sm">{value || <span className="text-gray-300">Not set</span>}</span>
  </div>
);

const StatCard = ({ label, value, color = "gray" }) => {
  const colorMap = {
    gray: "bg-gray-50 text-gray-900",
    emerald: "bg-emerald-50 text-emerald-700",
    yellow: "bg-yellow-50 text-yellow-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-lg p-4 ${colorMap[color]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm opacity-70">{label}</p>
    </div>
  );
};

export default AdminSellerDetail;
