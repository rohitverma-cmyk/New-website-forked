import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { trackGenerateLead } from "../lib/analytics";

const API = process.env.REACT_APP_BACKEND_URL;

const FABRIC_TYPES = [
  "Greige Fabric",
  "Dyed Fabric",
  "Printed Fabric",
  "Yarn Dyed Fabric",
  "Denim Fabrics",
];

const LOCATIONS = [
  { value: "", label: "Select", code: "+91" },
  { value: "India", label: "India", code: "+91" },
  { value: "Bangladesh", label: "Bangladesh", code: "+880" },
  { value: "Vietnam", label: "Vietnam", code: "+84" },
  { value: "Sri Lanka", label: "Sri Lanka", code: "+94" },
];

export default function RFQModal({ open, onClose, fabricUrl, fabricName }) {
  const [form, setForm] = useState({
    name: "", phone: "", country_code: "+91", gst_number: "", bin_number: "", company_name: "", email: "", fabric_type: "", location: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const isIndia = form.location === "India";
  const isBangladesh = form.location === "Bangladesh";

  const handleLocationChange = (e) => {
    const loc = e.target.value;
    const match = LOCATIONS.find(l => l.value === loc);
    setForm(p => ({
      ...p,
      location: loc,
      country_code: match ? match.code : "+91",
      gst_number: loc !== "India" ? "" : p.gst_number,
      bin_number: loc !== "Bangladesh" ? "" : p.bin_number,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isIndia && !form.gst_number) {
      toast.error("GST Number is required for India");
      return;
    }
    if (isBangladesh && !form.bin_number) {
      toast.error("BIN is required for Bangladesh");
      return;
    }
    setSubmitting(true);
    try {
      await fetch(`${API}/api/enquiries/rfq-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: `${form.country_code}${form.phone}`,
          fabric_type: fabricUrl ? "" : form.fabric_type,
          fabric_url: fabricUrl || "",
          fabric_name: fabricName || "",
        })
      });
      toast.success("Your enquiry has been submitted! Our team will reach out within 24 hours.");
      trackGenerateLead({ source: fabricUrl ? 'SKU Page RFQ' : 'Homepage RFQ', fabric_type: form.fabric_type, fabric_name: fabricName || '', location: form.location });
      onClose();
      setForm({ name: "", phone: "", country_code: "+91", gst_number: "", bin_number: "", company_name: "", email: "", fabric_type: "", location: "" });
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="rfq-modal-overlay">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl relative overflow-hidden" data-testid="rfq-modal">
        <div className="bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] px-6 py-5 text-white">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" data-testid="rfq-modal-close">
            <X size={20} />
          </button>
          <h3 className="text-lg font-semibold">Request a Quote</h3>
          <p className="text-blue-100 text-sm mt-1">Fill in your details — our sourcing experts will reach out within 24 hours.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" data-testid="rfq-form">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Your full name" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Location <span className="text-red-500">*</span></label>
              <select required value={form.location} onChange={handleLocationChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" data-testid="rfq-location">
                {LOCATIONS.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-700 flex items-center" data-testid="rfq-country-code">
                  {form.country_code}
                </span>
                <input type="tel" required value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone number" className="w-full px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-phone" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email ID <span className="text-red-500">*</span></label>
              <input type="email" required value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-email" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <span className="text-red-500">*</span></label>
            <input type="text" required value={form.company_name} onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Your company" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-company" />
          </div>

          {isIndia && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GST Number <span className="text-red-500">*</span></label>
              <input type="text" required value={form.gst_number} onChange={(e) => setForm(p => ({ ...p, gst_number: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-gst" />
            </div>
          )}

          {isBangladesh && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BIN (Business Identification Number) <span className="text-red-500">*</span></label>
              <input type="text" required value={form.bin_number} onChange={(e) => setForm(p => ({ ...p, bin_number: e.target.value }))} placeholder="Enter your BIN" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-bin" />
            </div>
          )}

          {fabricUrl ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium mb-1">Enquiry for</p>
              <a href={fabricUrl} className="text-sm font-medium text-[#2563EB] hover:underline" target="_blank" rel="noopener noreferrer" data-testid="rfq-fabric-link">{fabricName || fabricUrl}</a>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">What fabric type are you looking at? <span className="text-red-500">*</span></label>
              <select required value={form.fabric_type} onChange={(e) => setForm(p => ({ ...p, fabric_type: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" data-testid="rfq-fabric-type">
                <option value="">Select fabric type</option>
                {FABRIC_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
              </select>
            </div>
          )}

          <button type="submit" disabled={submitting} className="w-full py-3 bg-[#2563EB] text-white font-medium rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors flex items-center justify-center gap-2" data-testid="rfq-submit">
            {submitting ? "Submitting..." : "Get Fabric Samples"}
            {!submitting && <ArrowRight size={16} />}
          </button>
          <p className="text-center text-xs text-gray-400">Free samples &middot; No commitment &middot; Expert sourcing support</p>
        </form>
      </div>
    </div>
  );
}
