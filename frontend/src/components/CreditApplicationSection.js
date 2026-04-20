import { useState } from "react";
import { CheckCircle, ArrowRight, ArrowLeft, Upload, Loader2, FileText } from "lucide-react";
import { applyForCredit } from "../lib/api";
import { toast } from "sonner";

const COMPANY_TYPES = [
  { value: "proprietorship", label: "Sole Proprietorship" },
  { value: "partnership_llp", label: "Partnership / LLP" },
  { value: "pvt_ltd", label: "Private Limited" },
];

const TURNOVER_OPTIONS = [
  "2-5 Cr", "5-10 Cr", "10-25 Cr", "25-50 Cr", "50-100 Cr", "100 Cr+"
];

// Document checklist by company type — from the credit team's requirements
const DOCUMENTS = {
  proprietorship: [
    { key: "gst_otp", label: "GST OTP Validation", required: true, type: "auto" },
    { key: "gst_cert", label: "GST Certificate", required: true, type: "upload" },
    { key: "kyc_prop", label: "KYC (Aadhaar + PAN) of Proprietor", required: true, type: "upload" },
    { key: "bank_stmt", label: "Bank Statement (1 year)", required: true, type: "upload" },
    { key: "cibil_consent", label: "CIBIL Consent", required: true, type: "checkbox" },
    { key: "co_app_kyc", label: "Co-Applicant KYC (Aadhaar & PAN)", required: false, type: "upload" },
    { key: "msme_cert", label: "MSME Certificate", required: false, type: "upload" },
    { key: "ownership_proof", label: "Ownership Proof (Residence + Office)", required: false, type: "upload" },
    { key: "sanction_letter", label: "Sanction Letter (if existing loan in CIBIL)", required: false, type: "upload" },
    { key: "soa", label: "SOA (if overdues in CIBIL)", required: false, type: "upload" },
    { key: "udc_nach", label: "UDC & NACH", required: true, type: "checkbox" },
  ],
  partnership_llp: [
    { key: "gst_otp", label: "GST OTP Validation", required: true, type: "auto" },
    { key: "gst_cert", label: "GST Certificate", required: true, type: "upload" },
    { key: "kyc_partner", label: "KYC (Aadhaar + PAN) of Partner", required: true, type: "upload" },
    { key: "partnership_deed", label: "Partnership Deed", required: true, type: "upload" },
    { key: "bank_stmt", label: "Bank Statement (1 year)", required: true, type: "upload" },
    { key: "cibil_consent", label: "CIBIL Consent", required: true, type: "checkbox" },
    { key: "company_pan", label: "Company PAN", required: true, type: "upload" },
    { key: "br", label: "Board Resolution (BR)", required: false, type: "upload" },
    { key: "msme_cert", label: "MSME Certificate", required: false, type: "upload" },
    { key: "audited_fin", label: "Audited Financials - 2 Years (Balance Sheet)", required: true, type: "upload" },
    { key: "ownership_proof", label: "Ownership Proof (Residence + Office)", required: false, type: "upload" },
    { key: "sanction_letter", label: "Sanction Letter (if existing loan in CIBIL)", required: false, type: "upload" },
    { key: "soa", label: "SOA (if overdues in CIBIL)", required: false, type: "upload" },
    { key: "udc_nach", label: "UDC & NACH", required: true, type: "checkbox" },
  ],
  pvt_ltd: [
    { key: "gst_otp", label: "GST OTP Validation", required: true, type: "auto" },
    { key: "gst_cert", label: "GST Certificate", required: true, type: "upload" },
    { key: "kyc_director", label: "KYC (Aadhaar + PAN) of Director", required: true, type: "upload" },
    { key: "shareholding", label: "Shareholding Pattern, List of Directors, CoI, AoA & MoA", required: true, type: "upload" },
    { key: "bank_stmt", label: "Bank Statement (1 year)", required: true, type: "upload" },
    { key: "cibil_consent", label: "CIBIL Consent", required: true, type: "checkbox" },
    { key: "company_pan", label: "Company PAN", required: true, type: "upload" },
    { key: "br", label: "Board Resolution (BR)", required: false, type: "upload" },
    { key: "msme_cert", label: "MSME Certificate", required: false, type: "upload" },
    { key: "audited_fin", label: "Audited Financials - 2 Years (Balance Sheet)", required: true, type: "upload" },
    { key: "ownership_proof", label: "Ownership Proof (Residence + Office)", required: false, type: "upload" },
    { key: "sanction_letter", label: "Sanction Letter (if existing loan in CIBIL)", required: false, type: "upload" },
    { key: "soa", label: "SOA (if overdues in CIBIL)", required: false, type: "upload" },
    { key: "udc_nach", label: "UDC & NACH", required: true, type: "checkbox" },
  ],
};

const CreditApplicationSection = () => {
  const [step, setStep] = useState(1); // 1: company type, 2: details, 3: documents, 4: success
  const [companyType, setCompanyType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "", gst_number: "", turnover: "",
  });
  const [docChecks, setDocChecks] = useState({}); // key -> true/false for checkboxes
  const [docNames, setDocNames] = useState({}); // key -> filename for uploads

  const handleFileSelect = (key, e) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocNames(prev => ({ ...prev, [key]: file.name }));
    }
  };

  const toggleDoc = (key) => {
    setDocChecks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const requiredDocs = companyType ? DOCUMENTS[companyType]?.filter(d => d.required) || [] : [];
  const allRequiredDone = requiredDocs.every(d => {
    if (d.type === "auto") return true;
    if (d.type === "checkbox") return docChecks[d.key];
    return docNames[d.key];
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const docsList = (DOCUMENTS[companyType] || []).map(d => ({
        key: d.key,
        label: d.label,
        required: d.required,
        provided: d.type === "auto" ? true : d.type === "checkbox" ? !!docChecks[d.key] : !!docNames[d.key],
        filename: docNames[d.key] || "",
      }));
      await applyForCredit({
        ...form,
        company_type: companyType,
        documents: docsList,
      });
      setStep(4);
    } catch (err) {
      toast.error("Submission failed. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <section className="py-20 lg:py-28 bg-white" data-testid="credit-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left: Value Prop */}
          <div className="lg:sticky lg:top-32">
            <p className="text-sm tracking-widest text-emerald-600 uppercase mb-4">Locofast Credit</p>
            <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-6">
              Buy Now, Pay Later — Credit Line for Fabric Buyers
            </h2>
            <p className="text-lg text-neutral-600 leading-relaxed mb-8">
              Get approved for a credit line and source fabrics without upfront payment. Place orders using your Locofast wallet and settle within agreed terms.
            </p>
            <div className="space-y-4">
              {[
                { title: "Instant Credit Decisions", desc: "Apply once, get a credit limit assigned to your wallet" },
                { title: "Wallet-Based Booking", desc: "Use your credit balance to book samples and bulk orders" },
                { title: "Eligibility: 2Cr+ Turnover", desc: "Last FY or provisional turnover should be 2 Crore+" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-neutral-900">{item.title}</p>
                    <p className="text-sm text-neutral-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Step indicators */}
            {step < 4 && (
              <div className="flex items-center gap-2 mt-8">
                {[1, 2, 3].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= s ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                    {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-emerald-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
                <span className="ml-3 text-sm text-gray-500">
                  {step === 1 ? "Company Type" : step === 2 ? "Basic Details" : "Documents"}
                </span>
              </div>
            )}
          </div>

          {/* Right: Form */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200" data-testid="credit-form-container">

            {/* STEP 1: Company Type */}
            {step === 1 && (
              <div data-testid="credit-step-1">
                <h3 className="text-xl font-semibold text-neutral-900 mb-1">Apply for Credit</h3>
                <p className="text-sm text-neutral-500 mb-6">Step 1: Select your company type</p>
                <div className="space-y-3">
                  {COMPANY_TYPES.map(ct => (
                    <label
                      key={ct.value}
                      className={`flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${companyType === ct.value ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      data-testid={`company-type-${ct.value}`}
                    >
                      <input type="radio" name="companyType" value={ct.value} checked={companyType === ct.value} onChange={() => setCompanyType(ct.value)} className="text-emerald-600 w-5 h-5" />
                      <span className="font-medium text-gray-900">{ct.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => companyType && setStep(2)}
                  disabled={!companyType}
                  className="w-full mt-6 bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
                  data-testid="credit-next-1"
                >
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* STEP 2: Basic Details */}
            {step === 2 && (
              <div data-testid="credit-step-2">
                <h3 className="text-xl font-semibold text-neutral-900 mb-1">Basic Details</h3>
                <p className="text-sm text-neutral-500 mb-6">Step 2: Tell us about your business</p>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                      <input type="text" required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" placeholder="Your name" data-testid="credit-name" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
                      <input type="text" required value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" placeholder="Company name" data-testid="credit-company" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                      <input type="email" required value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" placeholder="you@company.com" data-testid="credit-email" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                      <input type="tel" required value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" placeholder="+91 98765 43210" data-testid="credit-phone" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">GST Number *</label>
                    <input type="text" maxLength={15} value={form.gst_number} onChange={(e) => setForm({...form, gst_number: e.target.value.toUpperCase()})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" placeholder="22AAAAA0000A1Z5" data-testid="credit-gst" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last FY Turnover / Provisional Turnover *</label>
                    <select required value={form.turnover} onChange={(e) => setForm({...form, turnover: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm" data-testid="credit-turnover">
                      <option value="">Select turnover range</option>
                      {TURNOVER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <p className="text-xs text-neutral-400 mt-1">Minimum 2 Crore annual turnover required</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center gap-2">
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    onClick={() => { if (form.name && form.email && form.phone && form.company && form.turnover) setStep(3); else toast.error("Please fill all required fields"); }}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2"
                    data-testid="credit-next-2"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Documents */}
            {step === 3 && (
              <div data-testid="credit-step-3">
                <h3 className="text-xl font-semibold text-neutral-900 mb-1">Documents Required</h3>
                <p className="text-sm text-neutral-500 mb-1">
                  Step 3: Upload documents for <span className="font-medium text-emerald-600">{COMPANY_TYPES.find(c => c.value === companyType)?.label}</span>
                </p>
                <p className="text-xs text-gray-400 mb-6">Fields marked * are mandatory</p>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                  {(DOCUMENTS[companyType] || []).map(doc => (
                    <div key={doc.key} className={`p-3 rounded-lg border ${doc.type === "auto" ? "bg-emerald-50 border-emerald-200" : docNames[doc.key] || docChecks[doc.key] ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-gray-200"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText size={14} className={`flex-shrink-0 ${docNames[doc.key] || docChecks[doc.key] || doc.type === "auto" ? "text-emerald-600" : "text-gray-400"}`} />
                          <span className="text-sm text-gray-800 truncate">
                            {doc.label} {doc.required && <span className="text-red-400">*</span>}
                          </span>
                        </div>

                        {doc.type === "auto" && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-medium flex-shrink-0">Auto-verified</span>
                        )}

                        {doc.type === "checkbox" && (
                          <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                            <input type="checkbox" checked={!!docChecks[doc.key]} onChange={() => toggleDoc(doc.key)} className="w-4 h-4 text-emerald-600 rounded" />
                            <span className="text-xs text-gray-500">I consent</span>
                          </label>
                        )}

                        {doc.type === "upload" && (
                          <div className="flex-shrink-0">
                            {docNames[doc.key] ? (
                              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                <CheckCircle size={12} /> {docNames[doc.key].length > 20 ? docNames[doc.key].slice(0, 20) + '...' : docNames[doc.key]}
                              </span>
                            ) : (
                              <label className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 flex items-center gap-1 font-medium text-gray-600">
                                <Upload size={12} /> Upload
                                <input type="file" className="hidden" onChange={(e) => handleFileSelect(doc.key, e)} accept=".pdf,.jpg,.jpeg,.png" />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep(2)} className="flex-1 py-3 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center gap-2">
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !allRequiredDone}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
                    data-testid="credit-submit-btn"
                  >
                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <>Submit Application <ArrowRight size={16} /></>}
                  </button>
                </div>
                {!allRequiredDone && <p className="text-xs text-red-400 text-center mt-2">Please complete all mandatory (*) documents</p>}
              </div>
            )}

            {/* STEP 4: Success */}
            {step === 4 && (
              <div className="text-center py-8" data-testid="credit-success">
                <CheckCircle size={56} className="text-emerald-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-neutral-900 mb-2">Application Submitted!</h3>
                <p className="text-neutral-600 mb-2">
                  Your credit application for <span className="font-medium">{COMPANY_TYPES.find(c => c.value === companyType)?.label}</span> has been received.
                </p>
                <p className="text-sm text-neutral-500">Our credit team will review your documents and contact you within 24-48 hours with your credit limit.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CreditApplicationSection;
