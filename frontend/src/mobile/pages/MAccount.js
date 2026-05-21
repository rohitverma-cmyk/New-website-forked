import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, Building2, MapPin, FileText, LogOut, ChevronRight, Package, ShoppingBag, MessageSquare, Bell, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { getCustomerProfile, updateCustomerProfile } from "../../lib/api";
import BottomSheet from "../components/BottomSheet";

export default function MAccount() {
  const navigate = useNavigate();
  const { customer, token, isLoggedIn, loading, logout, updateCustomer } = useCustomerAuth();
  const [profileSheet, setProfileSheet] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", gstin: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Phone-only accounts get a synthetic email — we detect and handle them
  // the same way the desktop does (prompt to add a real email).
  const isPhoneOnly = (customer?.email || "").endsWith("@phone.locofast.local");
  const displayEmail = isPhoneOnly ? "" : (customer?.email || "");

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) return; // unauthenticated guests see the CTA below
    (async () => {
      try {
        const res = await getCustomerProfile(token);
        updateCustomer(res.data);
      } catch (err) {
        // silent — token may have expired
      }
    })();
  }, [loading, isLoggedIn, token]); // eslint-disable-line

  const openEdit = () => {
    setForm({
      name: customer?.name || "",
      phone: customer?.phone || "",
      gstin: customer?.gstin || "",
      email: isPhoneOnly ? "" : (customer?.email || ""),
      address: customer?.address || "",
      city: customer?.city || "",
      state: customer?.state || "",
      pincode: customer?.pincode || "",
    });
    setErrors({});
    setProfileSheet(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Required";
    if (!form.phone.trim()) nextErrors.phone = "Required";
    else if (!/^\+?\d[\d\s-]{7,14}$/.test(form.phone.trim())) nextErrors.phone = "Enter a valid phone";
    if (!form.gstin.trim()) nextErrors.gstin = "Required";
    else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/i.test(form.gstin.trim())) nextErrors.gstin = "Enter a valid 15-char GSTIN";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = "Invalid email";
    if (form.pincode && !/^\d{6}$/.test(form.pincode.trim())) nextErrors.pincode = "6-digit pincode";

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // Only send `email` if user supplied a real one (server keeps the
      // synthetic phone-only email otherwise).
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      const res = await updateCustomerProfile(token, payload);
      updateCustomer(res.data);
      toast.success("Profile updated");
      setProfileSheet(false);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Couldn't save profile";
      // Surface GST-specific failures on the GSTIN field
      if (/gst/i.test(msg)) setErrors({ gstin: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onLogout = () => {
    logout();
    toast.success("Signed out");
    navigate("/m");
  };

  if (loading) {
    return (
      <div className="m-container" style={{ paddingTop: 16 }}>
        <div className="m-skeleton" style={{ height: 100, borderRadius: 16 }} />
      </div>
    );
  }

  // GUEST VIEW
  if (!isLoggedIn) {
    return (
      <div className="m-container" style={{ paddingTop: 12 }}>
        <div className="m-card" style={{ padding: 22, textAlign: "center", background: "linear-gradient(135deg, var(--m-orange-50), #FFE3CE)", border: "none" }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: "50%", background: "linear-gradient(135deg, var(--m-orange), var(--m-orange-700))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={30} />
          </div>
          <h1 className="m-title-lg">Sign in to Locofast</h1>
          <p className="m-body" style={{ marginTop: 6 }}>Track orders, manage RFQs, and reorder in one tap.</p>
          <button onClick={() => navigate("/m/login")} className="m-btn m-btn-primary" style={{ width: "100%", marginTop: 18 }}>
            Sign in with OTP
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <SectionLabel>Discover</SectionLabel>
          <MenuItem icon={ShoppingBag} label="Browse catalog" onClick={() => navigate("/m/catalog")} />
          <MenuItem icon={MessageSquare} label="Request a quote" onClick={() => navigate("/m/rfq")} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Profile header */}
      <div className="m-container" style={{ paddingTop: 12 }}>
        <div className="m-card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, var(--m-orange), var(--m-orange-700))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>
            {(customer?.name || customer?.email || "L").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--m-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {customer?.name || "Add your name"}
            </div>
            <div style={{ fontSize: 13, color: "var(--m-ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayEmail || (customer?.phone ? `+${customer.phone}` : "Phone-only account")}
            </div>
            {customer?.gst_verified && (
              <span className="m-chip m-chip-green" style={{ marginTop: 6, padding: "3px 8px", fontSize: 11 }}>
                <Shield size={10} /> GST Verified
              </span>
            )}
          </div>
          <button onClick={openEdit} style={{ background: "none", border: "1px solid var(--m-border-2)", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "var(--m-ink-2)", cursor: "pointer" }}>
            Edit
          </button>
        </div>
      </div>

      {/* Phone-only nudge */}
      {isPhoneOnly && (
        <div className="m-container" style={{ marginTop: 14 }}>
          <button
            onClick={openEdit}
            className="m-card"
            style={{ width: "100%", padding: 12, display: "flex", alignItems: "center", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", textAlign: "left", cursor: "pointer" }}
            data-testid="m-account-add-email-cta"
          >
            <Mail size={18} color="#92400E" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", margin: 0 }}>Add your email</p>
              <p style={{ fontSize: 11, color: "#92400E", opacity: 0.85, margin: "2px 0 0", lineHeight: 1.4 }}>
                So we can send invoices, order updates, and quote alerts.
              </p>
            </div>
            <ChevronRight size={16} color="#92400E" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="m-container" style={{ marginTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => navigate("/m/orders")} className="m-card" style={{ padding: 14, textAlign: "left", border: "1px solid var(--m-border)", cursor: "pointer" }} data-testid="m-account-orders-card">
            <Package size={20} color="var(--m-blue)" />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink-3)", marginTop: 6 }}>My orders</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-ink)" }}>View all</div>
          </button>
          <button onClick={() => navigate("/m/queries")} className="m-card" style={{ padding: 14, textAlign: "left", border: "1px solid var(--m-border)", cursor: "pointer" }} data-testid="m-account-queries-card">
            <MessageSquare size={20} color="var(--m-blue)" />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink-3)", marginTop: 6 }}>My queries</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-ink)" }}>View quotes</div>
          </button>
        </div>
        <button onClick={() => navigate("/m/rfq")} className="m-card" style={{ width: "100%", padding: "12px 14px", textAlign: "left", border: "1px solid var(--m-border)", cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", gap: 10 }} data-testid="m-account-new-rfq-cta">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--m-blue-50)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <MessageSquare size={18} color="var(--m-blue)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--m-ink)", margin: 0 }}>Request a new quote</p>
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "2px 0 0" }}>Custom fabric specs · receive supplier quotes in 24h</p>
          </div>
          <ChevronRight size={16} color="var(--m-ink-3)" />
        </button>
      </div>

      {/* Account info */}
      <div className="m-container" style={{ marginTop: 22 }}>
        <SectionLabel>Account info</SectionLabel>
        <div className="m-card" style={{ padding: 4 }}>
          <InfoRow icon={User} label="Name" value={customer?.name || "—"} />
          <InfoRow icon={Mail} label="Email" value={displayEmail || <span style={{ color: "#92400E" }}>Add an email</span>} />
          <InfoRow icon={Phone} label="Phone" value={customer?.phone || "—"} />
          <InfoRow icon={Building2} label="Company" value={customer?.company || "—"} />
          <InfoRow icon={FileText} label="GSTIN" value={customer?.gstin || "—"} />
          <InfoRow icon={MapPin} label="Address" value={customer?.address ? `${customer.address}, ${customer.city || ""} ${customer.pincode || ""}`.trim() : "—"} last />
        </div>
      </div>

      {/* Other */}
      <div className="m-container" style={{ marginTop: 22 }}>
        <SectionLabel>Preferences</SectionLabel>
        <MenuItem icon={Bell} label="Notifications" onClick={() => navigate("/m/notifications")} />
        <MenuItem icon={Smartphone} label="Switch to desktop site" onClick={() => { localStorage.setItem("lf_force_desktop", "1"); window.location.href = "/"; }} />
      </div>

      <div className="m-container" style={{ marginTop: 22 }}>
        <button onClick={onLogout} className="m-btn m-btn-outline" style={{ width: "100%", color: "var(--m-red)", borderColor: "#fecaca" }}>
          <LogOut size={16} /> Sign out
        </button>
        <p className="m-caption" style={{ textAlign: "center", marginTop: 14 }}>Locofast · v1.0.0 · Buyer App</p>
      </div>

      {/* Edit profile sheet */}
      <BottomSheet
        open={profileSheet}
        onClose={() => setProfileSheet(false)}
        title="Edit profile"
        footer={
          <button onClick={save} disabled={saving} className="m-btn m-btn-primary" style={{ width: "100%" }} data-testid="m-account-save-btn">
            {saving ? "Verifying GST…" : "Save changes"}
          </button>
        }
      >
        <FieldLabel>Full name *</FieldLabel>
        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Your name" error={errors.name} data-testid="m-account-name" />

        <FieldLabel style={{ marginTop: 12 }}>Phone *</FieldLabel>
        <Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="10-digit mobile" type="tel" error={errors.phone} data-testid="m-account-phone" />

        <FieldLabel style={{ marginTop: 12 }}>Email{isPhoneOnly ? " · add one to receive invoices" : ""}</FieldLabel>
        <Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@company.com" type="email" error={errors.email} data-testid="m-account-email" />

        <FieldLabel style={{ marginTop: 12 }}>GSTIN *</FieldLabel>
        <Input value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} placeholder="22AAAAA0000A1Z5" error={errors.gstin} data-testid="m-account-gstin" />
        <p className="m-caption" style={{ marginTop: 6 }}>Company name will be auto-filled from the GST registry on save.</p>

        {customer?.company && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--m-bg)", border: "1px solid var(--m-border)" }}>
            <div style={{ fontSize: 11, color: "var(--m-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Company</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-ink)", marginTop: 2 }}>{customer.company}</div>
          </div>
        )}

        <FieldLabel style={{ marginTop: 12 }}>Address</FieldLabel>
        <Input value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Street, building, area" data-testid="m-account-address" />

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 8, marginTop: 12 }}>
          <div>
            <FieldLabel>City</FieldLabel>
            <Input value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="City" />
          </div>
          <div>
            <FieldLabel>State</FieldLabel>
            <Input value={form.state} onChange={(v) => setForm({ ...form, state: v })} placeholder="State" />
          </div>
          <div>
            <FieldLabel>Pincode</FieldLabel>
            <Input value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} placeholder="6-digit" inputMode="numeric" error={errors.pincode} />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)", marginBottom: 8, padding: "0 4px" }}>{children}</div>;
}

function InfoRow({ icon: Icon, label, value, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: last ? "none" : "1px solid var(--m-border)" }}>
      <Icon size={16} color="var(--m-ink-3)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-ink)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="m-card" style={{ width: "100%", padding: "14px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8, border: "1px solid var(--m-border)", textAlign: "left" }}>
      <Icon size={18} color="var(--m-ink-2)" />
      <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "var(--m-ink)" }}>{label}</span>
      <ChevronRight size={16} color="var(--m-ink-3)" />
    </button>
  );
}

function FieldLabel({ children, style }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)", marginBottom: 6, ...style }}>{children}</label>;
}
function Input({ value, onChange, error, ...rest }) {
  return (
    <>
      <div className="m-card" style={{ padding: "2px 12px", border: `1px solid ${error ? "#FCA5A5" : "var(--m-border-2)"}` }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", border: "none", outline: "none", padding: "12px 0", fontSize: 15, background: "transparent", color: "var(--m-ink)" }} {...rest} />
      </div>
      {error && <p style={{ fontSize: 12, color: "#DC2626", margin: "4px 0 0", fontWeight: 500 }}>{error}</p>}
    </>
  );
}
