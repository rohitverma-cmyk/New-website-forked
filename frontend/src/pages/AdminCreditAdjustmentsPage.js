/**
 * AdminCreditAdjustmentsPage — OTP-gated form for posting manual
 * credit-note / debit-note / other ledger adjustments.
 *
 * Access restricted to sandeep.kumar@locofast.com (or whatever
 * `CREDIT_ADJUSTMENT_ADMIN_EMAIL` is configured to).
 *
 * Route: /admin/credit-adjustments
 *
 * Flow:
 *   1) Enter email → /admin/adjustments/send-otp
 *   2) Enter 6-digit OTP → /admin/adjustments/verify-otp → JWT (4h)
 *   3) Fill the adjustment form → /admin/adjustments/post
 */
import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Shield, Mail, KeyRound, FileText, Loader2, CheckCircle2 } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = "credit_adj_jwt";

const initialForm = {
  gst_number: "",
  type: "Credit Note",
  reference_no: "",
  amount: "",
  against_invoice_no: "",
  against_order_id: "",
  lender: "",
  reason: "",
  attachment_url: "",
};

export default function AdminCreditAdjustmentsPage() {
  const [stage, setStage] = useState(() => (localStorage.getItem(TOKEN_KEY) ? "form" : "email"));
  const [email, setEmail] = useState("sandeep.kumar@locofast.com");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [posting, setPosting] = useState(false);
  const [lastPosted, setLastPosted] = useState(null);

  const sendOtp = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/api/credit-ledger/admin/adjustments/send-otp`, { email });
      toast.success("OTP sent to your email");
      setStage("otp");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send OTP");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setVerifying(true);
    try {
      const res = await axios.post(`${API_URL}/api/credit-ledger/admin/adjustments/verify-otp`, { email, otp });
      localStorage.setItem(TOKEN_KEY, res.data.token);
      toast.success(`Authorised for ${res.data.expires_in_hours}h`);
      setStage("form");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid OTP");
    } finally {
      setVerifying(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setStage("email");
    setOtp("");
    setForm(initialForm);
  };

  const submitAdj = async (e) => {
    e?.preventDefault?.();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setStage("email"); return; }

    const payload = {
      ...form,
      gst_number: form.gst_number.trim().toUpperCase(),
      reference_no: form.reference_no.trim(),
      amount: Number(form.amount),
      reason: form.reason.trim(),
    };
    if (payload.gst_number.length !== 15) { toast.error("GSTIN must be 15 chars"); return; }
    if (!payload.reference_no) { toast.error("Reference No is required"); return; }
    if (!payload.reason) { toast.error("Reason is required"); return; }
    if (isNaN(payload.amount) || payload.amount === 0) { toast.error("Amount must be a non-zero number (CN positive, DN negative)"); return; }
    if (payload.type === "Debit Note" && payload.amount > 0) payload.amount = -Math.abs(payload.amount);
    if (payload.type === "Credit Note") payload.amount = Math.abs(payload.amount);

    setPosting(true);
    try {
      const res = await axios.post(`${API_URL}/api/credit-ledger/admin/adjustments/post`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Posted ${payload.type} · ${res.data.reference_no}`);
      setLastPosted({ ...payload });
      setForm(initialForm);
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to post adjustment";
      if (err.response?.status === 401) {
        toast.error("Session expired — re-verify OTP");
        signOut();
      } else {
        toast.error(detail);
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-2"><Shield className="h-6 w-6 text-amber-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Credit Adjustments</h1>
            <p className="text-sm text-slate-500">Post Credit Notes, Debit Notes, or Other ledger corrections. OTP-gated.</p>
          </div>
        </div>

        {stage === "email" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="adj-email-stage">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700"><Mail size={16} />Request OTP</div>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="authorised email"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
              data-testid="adj-email-input"
            />
            <button onClick={sendOtp} disabled={sending || !email.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50" data-testid="adj-send-otp-btn">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Send OTP
            </button>
            <p className="mt-3 text-xs text-slate-500">Only the configured credit-adjustment admin email can request an OTP.</p>
          </div>
        )}

        {stage === "otp" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="adj-otp-stage">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700"><KeyRound size={16} />Enter OTP sent to <span className="font-mono">{email}</span></div>
            <input
              type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-2xl tracking-[8px] font-mono focus:outline-none focus:ring-2 focus:ring-amber-200"
              data-testid="adj-otp-input"
            />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setStage("email"); setOtp(""); }} className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" data-testid="adj-otp-back-btn">Change email</button>
              <button onClick={verifyOtp} disabled={verifying || otp.length !== 6} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50" data-testid="adj-verify-otp-btn">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Verify
              </button>
            </div>
          </div>
        )}

        {stage === "form" && (
          <form onSubmit={submitAdj} className="rounded-2xl border border-amber-200 bg-white p-6" data-testid="adj-form-stage">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><FileText size={16} />New adjustment</div>
              <button type="button" onClick={signOut} className="text-xs text-rose-700 hover:underline" data-testid="adj-signout-btn">Sign out</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN" required>
                <input value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value.toUpperCase() })} maxLength={15} className="inp font-mono" data-testid="adj-gstin" />
              </Field>
              <Field label="Type" required>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="inp" data-testid="adj-type">
                  <option>Credit Note</option>
                  <option>Debit Note</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Reference No" required>
                <input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} className="inp font-mono" placeholder="CN/25-26/018" data-testid="adj-ref" />
              </Field>
              <Field label={`Amount (₹) — ${form.type === "Debit Note" ? "stored as negative" : form.type === "Credit Note" ? "stored as positive" : "signed (+/−)"}`} required>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="inp" data-testid="adj-amount" />
              </Field>
              <Field label="Against Invoice No (optional)">
                <input value={form.against_invoice_no} onChange={e => setForm({ ...form, against_invoice_no: e.target.value })} className="inp font-mono" placeholder="LF/25-26/462" data-testid="adj-inv" />
              </Field>
              <Field label="Against Order ID (optional)">
                <input value={form.against_order_id} onChange={e => setForm({ ...form, against_order_id: e.target.value })} className="inp font-mono" placeholder="LF/ORD/042" data-testid="adj-order" />
              </Field>
              <Field label="Lender (optional)">
                <input value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} className="inp" placeholder="Indifi / Muthoot / Locofast" data-testid="adj-lender" />
              </Field>
              <Field label="Attachment URL (optional, Cloudinary)">
                <input value={form.attachment_url} onChange={e => setForm({ ...form, attachment_url: e.target.value })} className="inp" data-testid="adj-attachment" />
              </Field>
              <Field label="Reason" required className="sm:col-span-2">
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} className="inp" placeholder="e.g. Short shipment — 60m undelivered" data-testid="adj-reason" />
              </Field>
            </div>

            <button type="submit" disabled={posting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50" data-testid="adj-submit-btn">
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Post adjustment
            </button>

            {lastPosted && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" data-testid="adj-last-posted">
                ✓ Posted <b>{lastPosted.type}</b> <span className="font-mono">{lastPosted.reference_no}</span> · {lastPosted.gst_number} · ₹{Math.abs(lastPosted.amount).toLocaleString("en-IN")}
              </div>
            )}
          </form>
        )}
      </div>
      <style>{`.inp{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-size:14px;background:#fff}.inp:focus{outline:none;border-color:#d97706;box-shadow:0 0 0 3px rgba(217,119,6,.15)}`}</style>
    </div>
  );
}

const Field = ({ label, required, className = "", children }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="text-rose-600"> *</span>}</span>
    {children}
  </label>
);
