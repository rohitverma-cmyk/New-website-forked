import { useEffect, useState } from "react";
import api, { uploadToCloudinary } from "../../lib/api";
import AdminLayout from "../../components/admin/AdminLayout";
import { Plus, Building2, Users, X, Loader2, Trash2, Copy, Wallet, ShieldCheck, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";

const LENDERS = ["Stride", "Muthoot", "Mintifi"];
const DESIGNATIONS = [
  "Management",
  "Procurement Manager",
  "Fabric Merchandiser",
  "Merchandiser",
];

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creditLines, setCreditLines] = useState([]);
  const [ledger, setLedger] = useState([]);

  const [form, setForm] = useState({
    name: "", gst: "", address: "", phone: "",
    logo_url: "",
    type: "brand",  // "brand" | "factory"
    parent_brand_id: "",
    admin_user_email: "", admin_user_name: "", admin_user_designation: "Management",
    allowed_category_ids: [],
  });
  const [creating, setCreating] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [tempPw, setTempPw] = useState(null);

  // Credit-line OTP flow state
  const [clForm, setClForm] = useState({ lender_name: LENDERS[0], amount_inr: "", note: "", screenshot_url: "" });
  const [otpSent, setOtpSent] = useState(null); // { otp_request_id, sent_to }
  const [otpCode, setOtpCode] = useState("");
  const [clBusy, setClBusy] = useState(false);

  // Sample credit OTP flow
  const [sampleDelta, setSampleDelta] = useState("");
  const [sampleNote, setSampleNote] = useState("");
  const [sampleOtpSent, setSampleOtpSent] = useState(null);
  const [sampleOtpCode, setSampleOtpCode] = useState("");
  const [sampleBusy, setSampleBusy] = useState(false);

  // Allowed-categories inline editor (slide-over)
  const [editCats, setEditCats] = useState(false);
  const [editCatIds, setEditCatIds] = useState([]);
  const [savingCats, setSavingCats] = useState(false);

  const startEditCats = () => {
    setEditCatIds(detail?.brand?.allowed_category_ids || []);
    setEditCats(true);
  };
  const toggleEditCat = (id) => {
    setEditCatIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const saveCats = async () => {
    if (!selected) return;
    if (editCatIds.length === 0) { toast.error("Select at least one category"); return; }
    setSavingCats(true);
    try {
      await api.put(`/admin/brands/${selected.id}`, { allowed_category_ids: editCatIds });
      toast.success("Categories updated");
      setEditCats(false);
      // Refresh both the slide-over detail and the table row
      await Promise.all([refreshDetail(), load()]);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Failed";
      toast.error(`Failed to save: ${msg}`);
    }
    setSavingCats(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([
        api.get("/admin/brands"),
        api.get("/categories"),
      ]);
      setBrands(bRes.data || []);
      setCategories(cRes.data || []);
    } catch {
      toast.error("Failed to load brands");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (brand) => {
    setSelected(brand);
    setOtpSent(null); setOtpCode("");
    setClForm({ lender_name: LENDERS[0], amount_inr: "", note: "", screenshot_url: "" });
    setDetail(null);
    setCreditLines([]);
    setLedger([]);
    // Each sub-call is independent; if credit-lines or ledger fails (e.g.
    // legacy enterprise has no records yet) we still want to render the Users
    // tab so admins can fix data. Only the core /brands/{id} call is fatal.
    const [dRes, lRes, ledRes] = await Promise.allSettled([
      api.get(`/admin/brands/${brand.id}`),
      api.get(`/admin/brands/${brand.id}/credit-lines`),
      api.get(`/admin/brands/${brand.id}/ledger`),
    ]);
    if (dRes.status === "fulfilled") {
      setDetail(dRes.value.data);
    } else {
      const err = dRes.reason;
      const msg = err?.response?.data?.detail || err?.message || "Unknown error";
      const status = err?.response?.status || "";
      // eslint-disable-next-line no-console
      console.error("[AdminBrands] /brands detail failed:", err);
      toast.error(`Failed to load enterprise (${status}): ${msg}`);
      setSelected(null);
      return;
    }
    if (lRes.status === "fulfilled") setCreditLines(lRes.value.data || []);
    else { console.error("[AdminBrands] credit-lines failed:", lRes.reason); toast.warning("Credit lines unavailable"); }
    if (ledRes.status === "fulfilled") setLedger(ledRes.value.data || []);
    else { console.error("[AdminBrands] ledger failed:", ledRes.reason); toast.warning("Ledger unavailable"); }
  };

  const refreshDetail = () => selected && openDetail(selected);

  const toggleCategory = (id) => {
    setForm((f) => ({
      ...f,
      allowed_category_ids: f.allowed_category_ids.includes(id)
        ? f.allowed_category_ids.filter((x) => x !== id)
        : [...f.allowed_category_ids, id],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.admin_user_email || !form.admin_user_name) {
      toast.error("Name, brand admin email and name are required"); return;
    }
    if (form.allowed_category_ids.length === 0) {
      if (!window.confirm("No categories selected. The brand will see an empty catalog until you update this. Continue?")) return;
    }
    setCreating(true);
    try {
      const res = await api.post("/admin/brands", form);
      setTempPw({ email: form.admin_user_email, password: res.data.temporary_password_for_reference });
      toast.success("Brand created — welcome email sent");
      setForm({ name: "", gst: "", address: "", phone: "", logo_url: "", admin_user_email: "", admin_user_name: "", admin_user_designation: "Management", allowed_category_ids: [] });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed");
    }
    setCreating(false);
  };

  const suspendBrand = async (brand) => {
    if (!window.confirm(`Soft-delete '${brand.name}' and suspend all users?`)) return;
    try {
      await api.delete(`/admin/brands/${brand.id}`);
      toast.success("Brand suspended"); load();
    } catch { toast.error("Delete failed"); }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Logo must be under 3 MB");
    setLogoUploading(true);
    try {
      const res = await uploadToCloudinary(file, "brand-logos");
      const url = res?.data?.url;
      if (!url) throw new Error("Upload failed");
      setForm((f) => ({ ...f, logo_url: url }));
      toast.success("Logo uploaded");
    } catch (err) { toast.error(err.message || "Upload failed"); }
    setLogoUploading(false);
  };

  const addUserToBrand = async () => {
    const email = window.prompt("New user email:"); if (!email) return;
    const name = window.prompt("User full name:"); if (!name) return;
    const designation = window.prompt(`Designation? One of: ${DESIGNATIONS.join(", ")}`, "Merchandiser") || "Merchandiser";
    if (!DESIGNATIONS.includes(designation)) return toast.error("Invalid designation");
    const role = window.prompt("Access level (brand_admin or brand_user):", "brand_user") || "brand_user";
    const customPw = window.prompt("Set a specific password? (leave blank to auto-generate; min 8 chars)", "") || "";
    if (customPw && customPw.length < 8) return toast.error("Password must be ≥8 characters");
    try {
      const payload = { email, name, role, designation };
      if (customPw) payload.password = customPw;
      const res = await api.post(`/admin/brands/${selected.id}/users`, payload);
      toast.success("User created — welcome email sent");
      refreshDetail();
      alert(`Password for ${email} (save this, emailed too):\n${res.data.temporary_password_for_reference}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Create failed"); }
  };

  const removeUser = async (userId) => {
    if (!window.confirm("Suspend this user? (Reversible — they won't be able to log in but account stays on record.)")) return;
    try {
      await api.delete(`/admin/brands/${selected.id}/users/${userId}`);
      refreshDetail(); toast.success("User suspended");
    } catch { toast.error("Failed"); }
  };

  const reactivateUser = async (userId) => {
    try {
      await api.post(`/admin/brands/${selected.id}/users/${userId}/reactivate`);
      refreshDetail(); toast.success("User reactivated");
    } catch { toast.error("Failed"); }
  };

  const hardDeleteUser = async (userId, email) => {
    if (!window.confirm(`PERMANENTLY delete ${email}? This cannot be undone. Use Suspend instead if you might want to restore access.`)) return;
    const confirm2 = window.prompt(`Type "DELETE ${email}" to confirm:`);
    if (confirm2 !== `DELETE ${email}`) return toast.error("Confirmation text did not match — aborted");
    try {
      await api.delete(`/admin/brands/${selected.id}/users/${userId}?hard=true`);
      refreshDetail(); toast.success("User deleted");
    } catch { toast.error("Failed"); }
  };

  const resetUserPassword = async (userId, email) => {
    const customPw = window.prompt(
      `Reset password for ${email}?\n\n` +
      `• Leave blank to auto-generate a temp password\n` +
      `• Or type one yourself (min 8 chars)\n\n` +
      `In either case, the user will be forced to change it on next login.`,
      ""
    );
    if (customPw === null) return;  // cancelled
    if (customPw && customPw.length < 8) return toast.error("Password must be ≥8 characters");
    const sendEmail = window.confirm("Send the password to the user via email?\n(OK = yes, Cancel = no, you'll share it manually)");
    try {
      const res = await api.post(
        `/admin/brands/${selected.id}/users/${userId}/reset-password`,
        { new_password: customPw || null, send_email: sendEmail }
      );
      refreshDetail();
      toast.success(sendEmail ? "Password reset — email sent" : "Password reset");
      alert(`New password for ${email}:\n\n${res.data.temporary_password_for_reference}\n\n${sendEmail ? "Already emailed." : "Share this with the user securely (WhatsApp/in-person)."}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Reset failed"); }
  };

  // === Credit line OTP flow ===
  const requestOtp = async () => {
    if (!clForm.lender_name || !clForm.amount_inr || Number(clForm.amount_inr) <= 0) {
      return toast.error("Lender + amount required");
    }
    setClBusy(true);
    try {
      const res = await api.post(`/admin/brands/${selected.id}/credit-lines/otp`, {
        lender_name: clForm.lender_name,
        amount_inr: Number(clForm.amount_inr),
        note: clForm.note || "",
      });
      setOtpSent(res.data);
      toast.success(`OTP sent to ${res.data.sent_to}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "OTP request failed"); }
    setClBusy(false);
  };

  const uploadCreditLine = async () => {
    if (!otpCode || otpCode.length < 4) return toast.error("Enter the OTP");
    setClBusy(true);
    try {
      await api.post(`/admin/brands/${selected.id}/credit-lines`, {
        otp_request_id: otpSent.otp_request_id,
        otp_code: otpCode,
        lender_name: clForm.lender_name,
        amount_inr: Number(clForm.amount_inr),
        screenshot_url: clForm.screenshot_url || "",
        note: clForm.note || "",
      });
      toast.success("Credit line added");
      setOtpSent(null); setOtpCode("");
      setClForm({ lender_name: LENDERS[0], amount_inr: "", note: "", screenshot_url: "" });
      refreshDetail();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    setClBusy(false);
  };

  // === Screenshot upload to Cloudinary (signed) ===
  const handleScreenshot = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const folder = "uploads/brand-credit-screenshots";
      const sig = await api.get("/cloudinary/signature", { params: { folder } });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.data.api_key);
      fd.append("timestamp", sig.data.timestamp);
      fd.append("signature", sig.data.signature);
      fd.append("folder", folder);
      const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.data.cloud_name}/auto/upload`, {
        method: "POST", body: fd,
      });
      const data = await up.json();
      if (!data.secure_url) throw new Error("Upload failed");
      setClForm((f) => ({ ...f, screenshot_url: data.secure_url }));
      toast.success("Screenshot uploaded");
    } catch (err) { toast.error(err.message || "Upload failed"); }
  };

  // === Sample credit adjust (now OTP-gated) ===
  const requestSampleOtp = async () => {
    const n = Number(sampleDelta);
    if (!n || Number.isNaN(n)) return toast.error("Enter a non-zero number");
    setSampleBusy(true);
    try {
      const res = await api.post(`/admin/brands/${selected.id}/sample-credits/otp`, { delta: n, note: sampleNote || "" });
      setSampleOtpSent(res.data);
      toast.success(`OTP sent to ${res.data.sent_to}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
    setSampleBusy(false);
  };

  const confirmSampleAdjust = async () => {
    if (!sampleOtpCode || sampleOtpCode.length < 4) return toast.error("Enter the OTP");
    setSampleBusy(true);
    try {
      await api.post(`/admin/brands/${selected.id}/sample-credits`, {
        otp_request_id: sampleOtpSent.otp_request_id,
        otp_code: sampleOtpCode,
        delta: Number(sampleDelta),
        note: sampleNote || "",
      });
      toast.success(`Sample credits ${Number(sampleDelta) > 0 ? "added" : "removed"}`);
      setSampleDelta(""); setSampleNote(""); setSampleOtpSent(null); setSampleOtpCode("");
      refreshDetail(); await load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
    setSampleBusy(false);
  };

  const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const totalAlloc = creditLines.reduce((s, l) => s + Number(l.amount_inr || 0), 0);
  const totalUtil = creditLines.reduce((s, l) => s + Number(l.utilized_inr || 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto" data-testid="admin-brands-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Building2 size={22} /> Enterprises
            </h1>
            <p className="text-sm text-gray-500 mt-1">Brands &amp; their factories — curated catalogs + credit lines</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm" data-testid="create-brand-btn">
            <Plus size={16} /> Create Enterprise
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
        ) : brands.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center">
            <Building2 className="text-gray-300 mx-auto mb-3" size={40} />
            <h3 className="text-gray-700 font-medium mb-1">No enterprises yet</h3>
            <p className="text-sm text-gray-500">Click "Create Enterprise" to onboard your first brand or factory.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Enterprise</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">GST</th>
                  <th className="px-4 py-3">Categories</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {brands.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50" data-testid={`brand-row-${b.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {b.logo_url ? (
                          <img src={b.logo_url} alt={b.name} className="w-8 h-8 rounded-md object-cover border border-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{b.name}</div>
                          <div className="text-xs text-gray-500">{b.phone || b.address || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(b.type || "brand") === "factory" ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">Factory</span>
                          {b.parent_brand_name && <div className="text-[11px] text-gray-500 mt-0.5">↳ {b.parent_brand_name}</div>}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">Brand</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{b.gst || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {(b.allowed_category_ids || []).length} {((b.allowed_category_ids || []).length === 1) ? "category" : "categories"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.user_count}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => openDetail(b)} className="text-emerald-700 hover:underline text-xs" data-testid={`brand-detail-${b.id}`}>Manage</button>
                      {b.status === "active" && (
                        <button onClick={() => suspendBrand(b)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="create-brand-modal">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Create Enterprise</h2>
                <button onClick={() => setShowCreate(false)}><X size={18} /></button>
              </div>
              <form onSubmit={submit} className="space-y-3">
                {/* Type picker — Brand vs Factory */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Enterprise Type *</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "brand", label: "Brand", hint: "Owns the designs, allocates to factory" },
                      { v: "factory", label: "Factory", hint: "Receives allocations, places orders" },
                    ].map((o) => (
                      <button
                        type="button"
                        key={o.v}
                        onClick={() => setForm((f) => ({ ...f, type: o.v, parent_brand_id: o.v === "brand" ? "" : f.parent_brand_id }))}
                        className={`text-left px-3 py-2 rounded-lg border ${form.type === o.v ? "bg-emerald-50 border-emerald-400 text-emerald-800" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                        data-testid={`enterprise-type-${o.v}`}
                      >
                        <div className="text-sm font-medium">{o.label}</div>
                        <div className="text-[11px] text-gray-500">{o.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {form.type === "factory" && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1.5">Parent Brand *</p>
                    <select
                      required
                      value={form.parent_brand_id}
                      onChange={(e) => setForm({ ...form, parent_brand_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      data-testid="create-enterprise-parent-brand"
                    >
                      <option value="">Select parent brand…</option>
                      {brands.filter((b) => (b.type || "brand") === "brand").map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Logo uploader — the personal touch */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">{form.type === "factory" ? "Factory" : "Brand"} Logo <span className="text-gray-400 font-normal">(optional — shows in the portal header)</span></p>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0" data-testid="create-brand-logo-preview">
                      {form.logo_url ? (
                        <img src={form.logo_url} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="text-gray-300" size={22} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs cursor-pointer ${logoUploading ? "bg-gray-50 border-gray-200 text-gray-400" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                        {logoUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        {logoUploading ? "Uploading…" : form.logo_url ? "Replace" : "Upload logo"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={logoUploading}
                          data-testid="create-brand-logo-upload"
                        />
                      </label>
                      {form.logo_url && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, logo_url: "" }))} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder={`${form.type === "factory" ? "Factory" : "Brand"} Name *`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="create-brand-name" />
                  <input placeholder="GST Number" value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Initial Admin User</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input required type="email" placeholder="Admin Email *" value={form.admin_user_email} onChange={(e) => setForm({ ...form, admin_user_email: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="create-brand-admin-email" />
                    <input required placeholder="Admin Full Name *" value={form.admin_user_name} onChange={(e) => setForm({ ...form, admin_user_name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="create-brand-admin-name" />
                  </div>
                  <select value={form.admin_user_designation} onChange={(e) => setForm({ ...form, admin_user_designation: e.target.value })} className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="create-brand-admin-designation">
                    {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Allowed Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button type="button" key={c.id} onClick={() => toggleCategory(c.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border ${form.allowed_category_ids.includes(c.id) ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-600"}`}
                        data-testid={`cat-chip-${c.id}`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={creating} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50" data-testid="submit-create-brand">
                  {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : `Create ${form.type === "factory" ? "Factory" : "Brand"} & Send Welcome Email`}
                </button>
              </form>
            </div>
          </div>
        )}

        {tempPw && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setTempPw(null); setShowCreate(false); }}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-emerald-700 mb-2">Brand Created</h3>
              <p className="text-sm text-gray-600 mb-3">Welcome email sent to <strong>{tempPw.email}</strong>. Password below is for your records:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between font-mono text-sm mb-4">
                <span>{tempPw.password}</span>
                <button onClick={() => { navigator.clipboard.writeText(tempPw.password); toast.success("Copied"); }}><Copy size={14} /></button>
              </div>
              <button onClick={() => { setTempPw(null); setShowCreate(false); }} className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium">Done</button>
            </div>
          </div>
        )}

        {/* Detail side-panel */}
        {selected && detail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end" onClick={() => { setSelected(null); setDetail(null); }}>
            <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="brand-detail-panel">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {detail.brand?.logo_url ? (
                    <img src={detail.brand.logo_url} alt={detail.brand.name} className="w-10 h-10 rounded-md object-cover border border-gray-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center">
                      <Building2 size={16} className="text-gray-400" />
                    </div>
                  )}
                  <h2 className="text-lg font-semibold">{detail.brand?.name}</h2>
                </div>
                <button onClick={() => { setSelected(null); setDetail(null); }}><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-5">
                <div><span className="text-gray-500">GST</span><p className="font-medium text-gray-800">{detail.brand?.gst || "—"}</p></div>
                <div><span className="text-gray-500">Phone</span><p className="font-medium text-gray-800">{detail.brand?.phone || "—"}</p></div>
                <div className="col-span-2"><span className="text-gray-500">Address</span><p className="font-medium text-gray-800">{detail.brand?.address || "—"}</p></div>
              </div>

              {/* Categories */}
              <div className="mb-5" data-testid="admin-brand-allowed-cats">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500">ALLOWED CATEGORIES</p>
                  {!editCats && (
                    <button
                      onClick={startEditCats}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-medium hover:underline"
                      data-testid="admin-edit-cats-btn"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {!editCats ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(detail.brand?.allowed_category_ids || []).map((id) => {
                      const c = categories.find((x) => x.id === id);
                      return <span key={id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{c?.name || id}</span>;
                    })}
                    {(detail.brand?.allowed_category_ids || []).length === 0 && <span className="text-xs text-gray-400">None unlocked yet</span>}
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                      {categories.length === 0 ? (
                        <span className="text-xs text-gray-400">No categories defined yet. Create them at /admin/categories first.</span>
                      ) : (
                        categories.map((c) => {
                          const on = editCatIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleEditCat(c.id)}
                              data-testid={`admin-edit-cat-${c.id}`}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${on ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                            >
                              {c.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveCats}
                        disabled={savingCats}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 font-medium"
                        data-testid="admin-save-cats-btn"
                      >
                        {savingCats ? "Saving…" : `Save (${editCatIds.length} selected)`}
                      </button>
                      <button
                        onClick={() => setEditCats(false)}
                        className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <span className="ml-auto text-[11px] text-gray-400">Brand will see only these categories on /enterprise/fabrics</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Credit Lines */}
              <div className="mb-6 border border-gray-200 rounded-xl p-4" data-testid="admin-brand-credit-panel">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><Wallet size={14} /> Credit Lines</p>
                  <div className="text-xs text-gray-600">
                    Allocated {fmtINR(totalAlloc)} · Available <span className="text-emerald-700 font-semibold">{fmtINR(totalAlloc - totalUtil)}</span>
                  </div>
                </div>
                {creditLines.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {creditLines.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-900 text-white px-2 py-0.5 rounded text-[10px]">{l.lender_name}</span>
                          <span className="text-gray-700 font-medium">{fmtINR(l.amount_inr)}</span>
                          <span className="text-gray-500">· Utilized {fmtINR(l.utilized_inr)}</span>
                        </div>
                        {l.screenshot_url && <a href={l.screenshot_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">view proof</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* OTP upload flow */}
                {!otpSent ? (
                  <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={clForm.lender_name} onChange={(e) => setClForm({ ...clForm, lender_name: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-xs" data-testid="cl-lender">
                        {LENDERS.map((l) => <option key={l}>{l}</option>)}
                      </select>
                      <input type="number" placeholder="Amount ₹" value={clForm.amount_inr} onChange={(e) => setClForm({ ...clForm, amount_inr: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-xs" data-testid="cl-amount" />
                    </div>
                    <input placeholder="Note (optional)" value={clForm.note} onChange={(e) => setClForm({ ...clForm, note: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                    <label className="text-xs flex items-center gap-2">
                      <span className="text-gray-600">Payment screenshot (optional)</span>
                      <input type="file" accept="image/*,application/pdf" onChange={handleScreenshot} className="text-xs" data-testid="cl-screenshot" />
                      {clForm.screenshot_url && <a href={clForm.screenshot_url} target="_blank" rel="noreferrer" className="text-emerald-700">preview</a>}
                    </label>
                    <button onClick={requestOtp} disabled={clBusy} className="w-full bg-gray-900 hover:bg-black text-white py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" data-testid="cl-request-otp">
                      <ShieldCheck size={12} /> Request OTP to my email
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                    <p className="text-xs text-emerald-900">OTP sent to <strong>{otpSent.sent_to}</strong> · expires in {otpSent.expires_in_minutes} min</p>
                    <input autoFocus placeholder="Enter 6-digit OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm font-mono tracking-widest text-center" data-testid="cl-otp-input" />
                    <div className="flex gap-2">
                      <button onClick={() => { setOtpSent(null); setOtpCode(""); }} className="flex-1 bg-white border border-gray-300 py-1.5 rounded text-xs">Cancel</button>
                      <button onClick={uploadCreditLine} disabled={clBusy} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded text-xs font-semibold disabled:opacity-50" data-testid="cl-submit">
                        {clBusy ? "..." : "Confirm & create"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Credits */}
              <div className="mb-6 border border-amber-200 rounded-xl p-4" data-testid="admin-brand-sample-panel">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Sample Credits</p>
                  <p className="text-xs text-gray-600">
                    Total <strong>{detail.brand?.sample_credits_total || 0}</strong> · Used {detail.brand?.sample_credits_used || 0} · Available <span className="text-amber-700 font-semibold">{(detail.brand?.sample_credits_total || 0) - (detail.brand?.sample_credits_used || 0)}</span>
                  </p>
                </div>
                <div className="flex gap-2 items-center bg-amber-50 p-3 rounded-lg">
                  <input type="number" placeholder="Delta (+ or -)" value={sampleDelta} onChange={(e) => setSampleDelta(e.target.value)} className="w-32 px-2 py-1.5 border border-gray-300 rounded text-xs" data-testid="sample-delta" disabled={!!sampleOtpSent} />
                  <input placeholder="Note" value={sampleNote} onChange={(e) => setSampleNote(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs" disabled={!!sampleOtpSent} />
                  {!sampleOtpSent ? (
                    <button onClick={requestSampleOtp} disabled={sampleBusy} className="bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-50" data-testid="sample-request-otp">
                      <ShieldCheck size={11} /> OTP
                    </button>
                  ) : (
                    <button onClick={() => { setSampleOtpSent(null); setSampleOtpCode(""); }} className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs">Cancel</button>
                  )}
                </div>
                {sampleOtpSent && (
                  <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-emerald-900 mb-1">OTP sent to <strong>{sampleOtpSent.sent_to}</strong></p>
                      <input
                        autoFocus
                        placeholder="6-digit OTP"
                        value={sampleOtpCode}
                        onChange={(e) => setSampleOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="w-full px-3 py-1.5 border border-emerald-300 rounded text-sm font-mono tracking-widest text-center"
                        data-testid="sample-otp-input"
                      />
                    </div>
                    <button onClick={confirmSampleAdjust} disabled={sampleBusy} className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded text-xs font-semibold disabled:opacity-50" data-testid="sample-confirm">
                      {sampleBusy ? "..." : "Confirm"}
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-2">₹1 = 1 credit. OTP goes to your admin email. Brands can also self-serve top-up via Razorpay in their portal (no OTP needed there).</p>
              </div>

              {/* Users */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500"><Users size={12} className="inline mr-1" />USERS ({detail.users?.length || 0})</p>
                  <button onClick={addUserToBrand} className="text-xs text-emerald-700 hover:underline" data-testid="add-brand-user-btn">+ Add User</button>
                </div>
                <div className="space-y-1.5">
                  {(detail.users || []).map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded border border-gray-100 text-xs" data-testid={`admin-brand-user-${u.id}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-gray-500 truncate">
                          {u.email} · {u.designation || "—"} · <span className="uppercase tracking-wide">{u.role === "brand_admin" ? "Admin" : "Buyer"}</span> ·{" "}
                          <span className={u.status === "suspended" ? "text-orange-600 font-medium" : "text-emerald-600"}>{u.status}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                        <button
                          onClick={() => resetUserPassword(u.id, u.email)}
                          className="text-blue-600 hover:text-blue-800 px-1.5 py-0.5 hover:bg-blue-50 rounded text-[11px]"
                          data-testid={`admin-user-reset-${u.id}`}
                          title="Reset password"
                        >
                          Reset PW
                        </button>
                        {u.status === "active" ? (
                          <button
                            onClick={() => removeUser(u.id)}
                            className="text-orange-600 hover:text-orange-800 px-1.5 py-0.5 hover:bg-orange-50 rounded text-[11px]"
                            data-testid={`admin-user-suspend-${u.id}`}
                            title="Suspend (reversible)"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivateUser(u.id)}
                            className="text-emerald-600 hover:text-emerald-800 px-1.5 py-0.5 hover:bg-emerald-50 rounded text-[11px]"
                            data-testid={`admin-user-reactivate-${u.id}`}
                            title="Reactivate user"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          onClick={() => hardDeleteUser(u.id, u.email)}
                          className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                          data-testid={`admin-user-delete-${u.id}`}
                          title="Permanently delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ledger */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">LEDGER (last 30)</p>
                {ledger.length === 0 ? (
                  <p className="text-xs text-gray-400">No activity yet.</p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {ledger.slice(0, 30).map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100">
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                            e.type === "credit_allocated" ? "bg-emerald-100 text-emerald-700" :
                            e.type === "debit_order" ? "bg-red-50 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{e.type}</span>
                          <span className="text-gray-500">{new Date(e.created_at).toLocaleDateString()}</span>
                        </div>
                        <span className="font-medium">{e.type.startsWith("sample") ? e.amount : fmtINR(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminBrands;
