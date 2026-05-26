import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, Building2, MapPin, FileText, LogOut, ChevronRight, Package, ShoppingBag, MessageSquare, Bell, Shield, Smartphone, Wallet, Heart } from "lucide-react";
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
  const [gstVerified, setGstVerified] = useState(false);
  const [gstVerifying, setGstVerifying] = useState(false);
  // Email-change flow state
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [emailChangeStage, setEmailChangeStage] = useState("new"); // 'new' | 'otp'
  const [newEmailInput, setNewEmailInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [emailChangeBusy, setEmailChangeBusy] = useState(false);

  const API_URL = process.env.REACT_APP_BACKEND_URL;

  const requestEmailChangeOtp = async () => {
    const ne = newEmailInput.trim().toLowerCase();
    if (!ne || !ne.includes("@")) { toast.error("Enter a valid email"); return; }
    setEmailChangeBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/customer/email-change/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_email: ne }),
      });
      const data = await r.json();
      if (!r.ok) { toast.error(data?.detail || "Couldn't send code"); setEmailChangeBusy(false); return; }
      toast.success("Code sent to " + ne);
      setEmailChangeStage("otp");
    } catch { toast.error("Network error. Try again."); }
    setEmailChangeBusy(false);
  };

  const verifyEmailChange = async () => {
    if (otpInput.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setEmailChangeBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/customer/email-change/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_email: newEmailInput.trim().toLowerCase(), otp: otpInput }),
      });
      const data = await r.json();
      if (!r.ok) { toast.error(data?.detail || "Couldn't verify"); setEmailChangeBusy(false); return; }
      toast.success("Email updated successfully");
      // Persist new token + customer
      localStorage.setItem("lf_customer_token", data.token);
      updateCustomer(data.customer);
      setForm((f) => ({ ...f, email: data.customer.email }));
      setShowEmailChange(false);
      setEmailChangeStage("new");
      setNewEmailInput("");
      setOtpInput("");
    } catch { toast.error("Network error. Try again."); }
    setEmailChangeBusy(false);
  };

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
    setGstVerified(!!customer?.gst_verified);
    setErrors({});
    setProfileSheet(true);
  };

  // On-demand GST verify — fills company/city/state/pincode/address without
  // waiting for Save. Mirrors desktop UX.
  const verifyGst = async () => {
    const cleaned = (form.gstin || "").trim().toUpperCase();
    if (cleaned.length !== 15) {
      setErrors((p) => ({ ...p, gstin: "GSTIN must be 15 characters" }));
      return;
    }
    setGstVerifying(true);
    setErrors((p) => ({ ...p, gstin: undefined }));
    try {
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${apiUrl}/api/gst/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: cleaned }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        const msg = data.detail || data.message || "GST verification failed";
        setErrors((p) => ({ ...p, gstin: msg }));
        setGstVerified(false);
        toast.error(msg);
        return;
      }
      setForm((p) => ({
        ...p,
        gstin: cleaned,
        city: p.city || data.city || "",
        state: p.state || data.state || "",
        pincode: p.pincode || data.pincode || "",
        address: p.address || data.address || "",
      }));
      setGstVerified(true);
      toast.success("GST verified");
    } catch (err) {
      setErrors((p) => ({ ...p, gstin: "GST service unavailable" }));
    } finally {
      setGstVerifying(false);
    }
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Required";
    if (!form.phone.trim()) nextErrors.phone = "Required";
    else if (!/^\+?\d[\d\s-]{7,14}$/.test(form.phone.trim())) nextErrors.phone = "Enter a valid phone";
    if (!form.gstin.trim()) nextErrors.gstin = "Required";
    else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/i.test(form.gstin.trim())) nextErrors.gstin = "Enter a valid 15-char GSTIN";
    else if (!gstVerified) nextErrors.gstin = "Tap Verify to confirm your GST";
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
      const data = res.data;
      const emailChanged = !!data._email_changed;
      updateCustomer(data);
      setProfileSheet(false);
      if (emailChanged) {
        toast.success("Profile saved — sign in again with your new email");
        setTimeout(() => { logout(); navigate("/m/login"); }, 1500);
      } else {
        toast.success("Profile updated");
      }
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
        <button onClick={() => navigate("/m/ledger")} className="m-card" style={{ width: "100%", padding: "12px 14px", textAlign: "left", border: "1px solid var(--m-border)", cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", gap: 10 }} data-testid="m-account-ledger-cta">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ecfdf5", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Wallet size={18} color="#059669" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--m-ink)", margin: 0 }}>Credit & Ledger</p>
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "2px 0 0" }}>Limits · disbursements · payments · adjustments</p>
          </div>
          <ChevronRight size={16} color="var(--m-ink-3)" />
        </button>
        <button onClick={() => navigate("/m/wishlists")} className="m-card" style={{ width: "100%", padding: "12px 14px", textAlign: "left", border: "1px solid var(--m-border)", cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", gap: 10 }} data-testid="m-account-wishlists-cta">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEE2E2", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Heart size={18} color="#E11D48" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--m-ink)", margin: 0 }}>My Wishlists</p>
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "2px 0 0" }}>Saved fabrics · shareable lists</p>
          </div>
          <ChevronRight size={16} color="var(--m-ink-3)" />
        </button>
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
            {saving ? "Saving…" : "Save changes"}
          </button>
        }
      >
        {/* GST — verified first, drives the rest */}
        <FieldLabel>
          GSTIN * {gstVerified && <span style={{ color: "var(--m-green, #16A34A)", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>· Verified</span>}
        </FieldLabel>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={form.gstin}
              onChange={(v) => {
                const up = v.toUpperCase();
                setForm({ ...form, gstin: up });
                if (up !== (customer?.gstin || "").toUpperCase()) setGstVerified(false);
              }}
              placeholder="22AAAAA0000A1Z5"
              error={errors.gstin}
              data-testid="m-account-gstin"
            />
          </div>
          <button
            type="button"
            onClick={verifyGst}
            disabled={gstVerifying || (form.gstin || "").length !== 15 || gstVerified}
            className="m-btn m-btn-primary"
            style={{ padding: "0 14px", fontSize: 13, height: 46, alignSelf: "flex-start", whiteSpace: "nowrap" }}
            data-testid="m-account-gstin-verify"
          >
            {gstVerifying ? "…" : gstVerified ? "Verified" : "Verify"}
          </button>
        </div>
        <p className="m-caption" style={{ marginTop: 6 }}>
          {gstVerified ? "Company, City, State, Pincode auto-filled." : "Tap Verify to auto-fill your company details."}
        </p>

        {customer?.company && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--m-bg)", border: "1px solid var(--m-border)" }}>
            <div style={{ fontSize: 11, color: "var(--m-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Company</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-ink)", marginTop: 2 }}>{customer.company}</div>
          </div>
        )}

        <FieldLabel style={{ marginTop: 12 }}>
          Email{isPhoneOnly ? " · add one to receive invoices" : ""}
          {!isPhoneOnly && customer?.email && (
            <button
              type="button"
              onClick={() => setShowEmailChange(true)}
              className="m-link"
              style={{ marginLeft: 8, fontSize: 11, color: "var(--m-primary)", fontWeight: 600, textDecoration: "underline" }}
              data-testid="m-change-email-btn"
            >
              Change email
            </button>
          )}
        </FieldLabel>
        <Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@company.com" type="email" error={errors.email} data-testid="m-account-email" disabled={!isPhoneOnly && !!customer?.email} />
        {form.email && (customer?.email || "").toLowerCase() !== form.email.toLowerCase() && !isPhoneOnly && customer?.email && (
          <p className="m-caption" style={{ marginTop: 6 }}>To change your email, tap "Change email" above — we'll verify the new address.</p>
        )}

        <FieldLabel style={{ marginTop: 12 }}>Full name *</FieldLabel>
        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Your name" error={errors.name} data-testid="m-account-name" />

        <FieldLabel style={{ marginTop: 12 }}>Phone *</FieldLabel>
        <Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="10-digit mobile" type="tel" error={errors.phone} data-testid="m-account-phone" />

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

      {/* Change-email Bottom Sheet (OTP-verified) */}
      <BottomSheet
        open={showEmailChange}
        onClose={() => { setShowEmailChange(false); setEmailChangeStage("new"); setNewEmailInput(""); setOtpInput(""); }}
        title={emailChangeStage === "new" ? "Change your email" : "Enter the 6-digit code"}
        footer={
          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ width: "100%" }}
            disabled={emailChangeBusy}
            onClick={emailChangeStage === "new" ? requestEmailChangeOtp : verifyEmailChange}
            data-testid="m-email-change-submit"
          >
            {emailChangeBusy ? (emailChangeStage === "new" ? "Sending…" : "Verifying…") : (emailChangeStage === "new" ? "Send code" : "Verify & change")}
          </button>
        }
      >
        {emailChangeStage === "new" ? (
          <>
            <p className="m-caption" style={{ marginBottom: 12 }}>
              We'll send a 6-digit code to your <strong>new</strong> email address. Once verified, your login email will be updated everywhere.
            </p>
            <FieldLabel>Current email</FieldLabel>
            <div className="m-card" style={{ padding: "12px", border: "1px solid var(--m-border)", background: "var(--m-bg)", marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: "var(--m-ink-3)" }}>{customer?.email}</span>
            </div>
            <FieldLabel>New email *</FieldLabel>
            <Input value={newEmailInput} onChange={setNewEmailInput} placeholder="new@brand.com" type="email" data-testid="m-email-change-new" />
          </>
        ) : (
          <>
            <p className="m-caption" style={{ marginBottom: 12 }}>
              We've sent a 6-digit code to <strong>{newEmailInput}</strong>. Enter it below.
            </p>
            <FieldLabel>Verification code</FieldLabel>
            <Input
              value={otpInput}
              onChange={(v) => setOtpInput(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              type="tel"
              data-testid="m-email-change-otp"
            />
            <button
              type="button"
              onClick={() => { setEmailChangeStage("new"); setOtpInput(""); }}
              className="m-link"
              style={{ marginTop: 10, fontSize: 12, color: "var(--m-primary)", textDecoration: "underline", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
            >
              Use a different email
            </button>
          </>
        )}
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
