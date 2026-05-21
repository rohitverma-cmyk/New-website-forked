import { useState, useEffect } from "react";
import { Search, Mail, Phone, Building2, FileText, ShoppingCart, CheckCircle2, XCircle, Filter, Plus, Loader2 } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const sourceBadge = (via) => {
  if (!via) return <Badge variant="outline" className="text-xs">Manual</Badge>;
  const map = {
    external_api: { label: "External API", cls: "bg-purple-50 text-purple-700 border-purple-200" },
    whatsapp_otp: { label: "WhatsApp", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    email_otp: { label: "Email OTP", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    admin_manual: { label: "Admin", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const m = map[via] || { label: via, cls: "bg-gray-50 text-gray-700 border-gray-200" };
  return <Badge variant="outline" className={`text-xs ${m.cls}`}>{m.label}</Badge>;
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso?.slice(0, 10); }
};

const StatCard = ({ label, value, accent = "blue" }) => {
  const accents = {
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    emerald: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accents[accent].split(" ")[1]}`}>{value ?? "—"}</p>
    </div>
  );
};

const EMPTY_FORM = {
  name: "", email: "", phone: "", company: "", gstin: "",
  address: "", city: "", state: "", pincode: "", notes: "",
};

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstVerified, setGstVerified] = useState(false);
  const [gstError, setGstError] = useState("");

  const token = localStorage.getItem("locofast_token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/customers/stats`, { headers });
      if (r.ok) setStats(await r.json());
    } catch { /* ignore */ }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      const r = await fetch(`${API_URL}/api/admin/customers/?${params}`, { headers });
      if (!r.ok) throw new Error("fetch failed");
      const data = await r.json();
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load customers");
    }
    setLoading(false);
  };

  useEffect(() => { fetchStats(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setTimeout(fetchCustomers, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search, sourceFilter]);

  const openDetail = async (c) => {
    setSelected(c);
    setDetailOpen(true);
    setDetail(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/customers/${c.id}`, { headers });
      if (r.ok) setDetail(await r.json());
    } catch {
      toast.error("Failed to load customer detail");
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setGstVerified(false);
    setGstError("");
    setCreateOpen(true);
  };

  const verifyGst = async () => {
    const gstin = (form.gstin || "").trim().toUpperCase();
    if (gstin.length !== 15) {
      setGstError("GSTIN must be 15 characters");
      return;
    }
    setGstVerifying(true);
    setGstError("");
    setGstVerified(false);
    try {
      const r = await fetch(`${API_URL}/api/gst/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin }),
      });
      const data = await r.json();
      if (!r.ok || !data.valid) {
        setGstError(data.message || data.detail || "GSTIN not found in registry");
        return;
      }
      // Auto-fill company name + city/state/pincode from the registry
      setForm((prev) => ({
        ...prev,
        gstin,
        company: data.legal_name || data.trade_name || prev.company,
        city: prev.city || data.city || "",
        state: prev.state || data.state || "",
        pincode: prev.pincode || data.pincode || "",
        address: prev.address || data.address || "",
      }));
      setGstVerified(true);
      toast.success(`GST verified: ${data.legal_name || data.trade_name}`);
    } catch (err) {
      setGstError("GST verification service unavailable");
    } finally {
      setGstVerifying(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCreating(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
      );
      // Strip empty optional strings — backend treats "" as falsy anyway
      if (!payload.phone) delete payload.phone;
      if (!payload.gstin) delete payload.gstin;

      const r = await fetch(`${API_URL}/api/admin/customers/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));

      if (r.status === 409) {
        const ex = data?.detail?.existing_customer;
        toast.error(`A customer already exists with this email/phone${ex ? `: ${ex.name || ex.email}` : ""}`);
        return;
      }
      if (!r.ok) {
        const msg = typeof data?.detail === "string"
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail.map(e => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ")
            : "Failed to create customer";
        toast.error(msg);
        return;
      }

      toast.success(`Customer "${form.name}" created`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      fetchCustomers();
      fetchStats();
    } catch {
      toast.error("Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-customers-page" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customers</h1>
            <p className="text-gray-500 text-sm mt-1">All registered buyers across email, WhatsApp, and external API sources</p>
          </div>
          <Button onClick={openCreate} data-testid="create-customer-btn" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-sm">
            <Plus className="w-4 h-4" />
            New Customer
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard label="Total" value={stats?.total} accent="blue" />
          <StatCard label="External API" value={stats?.via_external_api} accent="purple" />
          <StatCard label="WhatsApp OTP" value={stats?.via_whatsapp_otp} accent="emerald" />
          <StatCard label="Email OTP" value={stats?.via_email_otp} accent="indigo" />
          <StatCard label="Admin-added" value={stats?.via_admin_manual} accent="amber" />
          <StatCard label="With GST" value={stats?.with_gst} accent="amber" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              data-testid="customer-search-input"
              placeholder="Search by name, email, phone, company, or GST"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full md:w-56" data-testid="customer-source-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="external_api">External API</SelectItem>
              <SelectItem value="whatsapp_otp">WhatsApp OTP</SelectItem>
              <SelectItem value="email_otp">Email OTP</SelectItem>
              <SelectItem value="admin_manual">Admin-added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Company / GST</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Source</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">RFQs</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Orders</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No customers found</td></tr>
                ) : customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50" data-testid={`customer-row-${c.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-blue-700 font-semibold text-sm">
                            {(c.name || c.email || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{c.name || "—"}</p>
                          <p className="text-xs text-gray-500">{c.gst_verified ? "✓ GST verified" : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-gray-700 truncate max-w-[220px]">
                          <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-xs truncate">{c.email || "—"}</span>
                        </div>
                        {c.phone && (
                          <div className="flex items-center gap-1 text-gray-700">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs">{c.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-gray-700 truncate max-w-[200px]">
                          <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-xs truncate">{c.company || "—"}</span>
                        </div>
                        {c.gstin && <p className="text-xs font-mono text-gray-500">{c.gstin}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{sourceBadge(c.created_via)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        <span className={c.rfq_count > 0 ? "font-semibold text-blue-700" : "text-gray-400"}>{c.rfq_count}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <ShoppingCart className="w-3.5 h-3.5 text-gray-400" />
                        <span className={c.order_count > 0 ? "font-semibold text-emerald-700" : "text-gray-400"}>{c.order_count}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(c)} data-testid={`view-customer-${c.id}`}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && customers.length > 0 && (
            <div className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50">
              Showing {customers.length} of {total} customers
            </div>
          )}
        </div>

        {/* Detail dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="customer-detail-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span>{selected?.name || selected?.email}</span>
                {selected && sourceBadge(selected.created_via)}
              </DialogTitle>
            </DialogHeader>

            {!detail ? (
              <p className="text-gray-400 py-8 text-center">Loading customer details…</p>
            ) : (
              <div className="space-y-5">
                {/* Profile block */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Profile</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Name</p><p className="font-medium mt-0.5">{detail.customer.name || "—"}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Email</p><p className="font-medium mt-0.5 break-all">{detail.customer.email || "—"}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Phone</p><p className="font-medium mt-0.5">{detail.customer.phone || "—"}{detail.customer.phone_verified && <CheckCircle2 className="inline w-3.5 h-3.5 ml-1 text-emerald-600" />}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Company</p><p className="font-medium mt-0.5">{detail.customer.company || "—"}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">GSTIN</p><p className="font-medium mt-0.5 font-mono text-xs">{detail.customer.gstin || "—"}{detail.customer.gst_verified ? <CheckCircle2 className="inline w-3.5 h-3.5 ml-1 text-emerald-600" /> : detail.customer.gstin ? <XCircle className="inline w-3.5 h-3.5 ml-1 text-amber-500" /> : null}</p></div>
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Source</p><p className="font-medium mt-0.5">{detail.customer.created_via || "manual"}</p></div>
                    {detail.customer.lead_source && <div><p className="text-xs uppercase tracking-wide text-gray-500">Lead Source</p><p className="font-medium mt-0.5">{detail.customer.lead_source}</p></div>}
                    <div><p className="text-xs uppercase tracking-wide text-gray-500">Joined</p><p className="font-medium mt-0.5">{formatDate(detail.customer.created_at)}</p></div>
                    {(detail.customer.city || detail.customer.state) && <div><p className="text-xs uppercase tracking-wide text-gray-500">Location</p><p className="font-medium mt-0.5">{[detail.customer.city, detail.customer.state, detail.customer.pincode].filter(Boolean).join(", ") || "—"}</p></div>}
                  </div>
                </div>

                {/* RFQs */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    RFQs <span className="text-xs text-gray-500 font-normal">({detail.rfqs.length})</span>
                  </h3>
                  {detail.rfqs.length === 0 ? (
                    <p className="text-sm text-gray-400">No RFQs from this customer yet</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {detail.rfqs.map((r) => (
                        <div key={r.rfq_number} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded text-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-blue-700 text-xs">{r.rfq_number}</span>
                            <Badge variant="outline" className="text-xs">{r.category}</Badge>
                            {r.lead_source && <span className="text-xs text-gray-500 truncate">via {r.lead_source}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                            <span className="text-xs text-gray-500">{formatDate(r.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Orders */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-gray-400" />
                    Orders <span className="text-xs text-gray-500 font-normal">({detail.orders.length})</span>
                  </h3>
                  {detail.orders.length === 0 ? (
                    <p className="text-sm text-gray-400">No orders from this customer yet</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {detail.orders.map((o) => (
                        <div key={o.order_number} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded text-sm">
                          <span className="font-mono text-emerald-700 text-xs">{o.order_number}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs capitalize">{o.status}</Badge>
                            <span className="text-xs font-medium">{o.currency || "₹"}{o.total_amount}</span>
                            <span className="text-xs text-gray-500">{formatDate(o.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Customer Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl" data-testid="create-customer-modal">
            <DialogHeader>
              <DialogTitle>Add new customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="cc-name">Full name <span className="text-red-500">*</span></Label>
                  <Input id="cc-name" data-testid="cc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aarav Sharma" required />
                </div>
                <div>
                  <Label htmlFor="cc-email">Email <span className="text-red-500">*</span></Label>
                  <Input id="cc-email" data-testid="cc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="aarav@acme.in" required />
                </div>
                <div>
                  <Label htmlFor="cc-phone">Phone</Label>
                  <Input id="cc-phone" data-testid="cc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                </div>
                <div>
                  <Label htmlFor="cc-company">Company</Label>
                  <Input id="cc-company" data-testid="cc-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Garments Pvt Ltd" />
                </div>
                <div>
                  <Label htmlFor="cc-gstin" className="flex items-center gap-1">
                    GSTIN
                    {gstVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="cc-gstin"
                      data-testid="cc-gstin"
                      value={form.gstin}
                      onChange={(e) => {
                        setForm({ ...form, gstin: e.target.value.toUpperCase() });
                        setGstVerified(false);
                        setGstError("");
                      }}
                      placeholder="27AAACR5055K1ZP"
                      maxLength={15}
                      className={`flex-1 font-mono uppercase ${gstError ? "border-red-400" : gstVerified ? "border-emerald-400" : ""}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={gstVerified ? "outline" : "secondary"}
                      onClick={verifyGst}
                      disabled={gstVerifying || gstVerified || (form.gstin || "").length !== 15}
                      data-testid="cc-gst-verify-btn"
                      className="shrink-0"
                    >
                      {gstVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : gstVerified ? "✓" : "Verify"}
                    </Button>
                  </div>
                  {gstError && <p className="text-xs text-red-600 mt-1">{gstError}</p>}
                  {gstVerified && <p className="text-xs text-emerald-600 mt-1">GST verified · Company auto-filled</p>}
                </div>
                <div className="col-span-2">
                  <Label htmlFor="cc-address">Address</Label>
                  <Input id="cc-address" data-testid="cc-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, area" />
                </div>
                <div>
                  <Label htmlFor="cc-city">City</Label>
                  <Input id="cc-city" data-testid="cc-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mumbai" />
                </div>
                <div>
                  <Label htmlFor="cc-state">State</Label>
                  <Input id="cc-state" data-testid="cc-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Maharashtra" />
                </div>
                <div>
                  <Label htmlFor="cc-pincode">Pincode</Label>
                  <Input id="cc-pincode" data-testid="cc-pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="400001" maxLength={10} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="cc-notes">Internal notes</Label>
                  <Textarea id="cc-notes" data-testid="cc-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context for the team — visible only to admins" />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                The customer will be created as an admin-added profile. They can later log in via Email or WhatsApp OTP using this email/phone — orders &amp; RFQs will auto-link.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                <Button type="submit" disabled={creating} data-testid="cc-submit">{creating ? "Creating…" : "Create customer"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCustomers;
