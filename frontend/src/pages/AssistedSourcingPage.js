import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, CheckCircle2, MessageCircle, Send, Search, X, Tag } from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getCategories, getFabrics, createEnquiry } from "../lib/api";

const AssistedSourcingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [recommendedFabrics, setRecommendedFabrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  const [formData, setFormData] = useState({
    // Contact Info
    name: "",
    company_name: "",
    phone: "",
    gst_number: "",
    email: "",
    // Fabric Requirements
    category_id: "",
    fabric_type: "",
    gsm_range: "",
    composition_preference: "",
    end_use: "",
    quantity_needed: "",
    budget_range: "",
    additional_notes: "",
    // Selected fabrics for enquiry
    selected_fabrics: []
  });

  const fabricTypes = ["Woven", "Knitted", "Non-Woven", "Any"];
  const gsmRanges = ["Under 100 GSM", "100-150 GSM", "150-200 GSM", "200-300 GSM", "300+ GSM", "Not Sure"];
  const compositions = ["100% Cotton", "Cotton Blend", "Polyester", "Poly-Cotton", "Viscose", "Linen", "Other", "Not Sure"];
  const endUses = ["Shirts", "Trousers", "Dresses", "T-Shirts", "Jackets", "Home Textiles", "Industrial", "Other"];
  const quantities = ["100-500 meters", "500-1000 meters", "1000-5000 meters", "5000+ meters", "Not Sure Yet"];
  const budgets = ["Under ₹100/m", "₹100-200/m", "₹200-300/m", "₹300-500/m", "₹500+/m", "Flexible"];

  // Popular search tags for quick filtering
  const popularTags = [
    { label: "Cotton", category: "composition" },
    { label: "Denim", category: "type" },
    { label: "Silk", category: "composition" },
    { label: "Linen", category: "composition" },
    { label: "Polyester", category: "composition" },
    { label: "Shirting", category: "use" },
    { label: "Suiting", category: "use" },
    { label: "T-Shirt Fabric", category: "use" },
    { label: "Printed", category: "pattern" },
    { label: "Solid", category: "pattern" },
    { label: "Stripes", category: "pattern" },
    { label: "Checks", category: "pattern" },
    { label: "Lightweight", category: "weight" },
    { label: "Medium Weight", category: "weight" },
    { label: "Heavy Weight", category: "weight" },
    { label: "Stretch", category: "feature" },
    { label: "Wrinkle-Free", category: "feature" },
    { label: "Organic", category: "feature" },
    { label: "Sustainable", category: "feature" },
    { label: "Premium", category: "quality" },
  ];

  const tagColors = {
    composition: "bg-blue-100 text-blue-700 border-blue-200",
    type: "bg-purple-100 text-purple-700 border-purple-200",
    use: "bg-green-100 text-green-700 border-green-200",
    pattern: "bg-orange-100 text-orange-700 border-orange-200",
    weight: "bg-cyan-100 text-cyan-700 border-cyan-200",
    feature: "bg-pink-100 text-pink-700 border-pink-200",
    quality: "bg-amber-100 text-amber-700 border-amber-200",
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const clearAllTags = () => {
    setSelectedTags([]);
    setSearchQuery("");
  };

  useEffect(() => {
    getCategories().then(res => setCategories(res.data)).catch(console.error);
  }, []);

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const params = {};
      if (formData.category_id) params.category_id = formData.category_id;
      if (formData.fabric_type && formData.fabric_type !== "Any") {
        params.fabric_type = formData.fabric_type.toLowerCase();
      }
      
      const res = await getFabrics({ ...params, limit: 12 });
      setRecommendedFabrics(res.data);
    } catch (err) {
      console.error("Error fetching recommendations:", err);
    }
    setLoading(false);
  };

  const toggleFabricSelection = (fabricId) => {
    setFormData(prev => ({
      ...prev,
      selected_fabrics: prev.selected_fabrics.includes(fabricId)
        ? prev.selected_fabrics.filter(id => id !== fabricId)
        : [...prev.selected_fabrics, fabricId]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.phone || !formData.company_name || !formData.gst_number) {
      toast.error("Please fill in all required contact details including GST number");
      return;
    }

    setSubmitting(true);
    try {
      // Create enquiry with sourcing brief data
      const enquiryData = {
        name: formData.name,
        email: formData.email || `${formData.phone}@sourcing.locofast.com`,
        phone: formData.phone,
        company: formData.company_name,
        message: `
ASSISTED SOURCING REQUEST

Contact Details:
- Name: ${formData.name}
- Company: ${formData.company_name}
- Phone: ${formData.phone}
- GST: ${formData.gst_number || "Not provided"}
- Email: ${formData.email || "Not provided"}

Search Query: ${searchQuery || "None"}
Selected Tags: ${selectedTags.length > 0 ? selectedTags.join(", ") : "None"}

Fabric Requirements:
- Category: ${categories.find(c => c.id === formData.category_id)?.name || "Any"}
- Fabric Type: ${formData.fabric_type || "Any"}
- GSM Range: ${formData.gsm_range || "Not specified"}
- Composition: ${formData.composition_preference || "Any"}
- End Use: ${formData.end_use || "Not specified"}
- Quantity Needed: ${formData.quantity_needed || "Not specified"}
- Budget Range: ${formData.budget_range || "Flexible"}

Additional Notes: ${formData.additional_notes || "None"}

Selected Fabric IDs: ${formData.selected_fabrics.length > 0 ? formData.selected_fabrics.join(", ") : "None selected"}
        `.trim(),
        fabric_id: formData.selected_fabrics[0] || null,
        quantity: formData.quantity_needed
      };

      await createEnquiry(enquiryData);
      toast.success("Your sourcing request has been submitted! Our team will contact you shortly.");
      navigate("/");
    } catch (err) {
      toast.error("Failed to submit. Please try again.");
    }
    setSubmitting(false);
  };

  const whatsappNumber = "918920392418";
  const whatsappMessage = encodeURIComponent(`Hi, I need help sourcing fabric.

Name: ${formData.name}
Company: ${formData.company_name}
Phone: ${formData.phone}
GST: ${formData.gst_number}

Search: ${searchQuery || "N/A"}
Tags: ${selectedTags.length > 0 ? selectedTags.join(", ") : "None"}

Looking for: ${formData.fabric_type || "Any"} fabric
Category: ${categories.find(c => c.id === formData.category_id)?.name || "Any"}
GSM: ${formData.gsm_range || "Any"}
End Use: ${formData.end_use || "Not specified"}
Quantity: ${formData.quantity_needed || "Not specified"}`);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="pt-24 pb-20">
        <div className="container-main">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Link to="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6">
              <ArrowLeft size={16} />
              Back to Home
            </Link>
            <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 mb-4">
              Get Assisted Sourcing
            </h1>
            <p className="text-slate-600 text-lg">
              Tell us what you need and we'll find the perfect fabric match for you.
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-12">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                  step >= s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  {step > s ? <CheckCircle2 size={20} /> : s}
                </div>
                {s < 4 && <div className={`w-12 h-1 mx-1 ${step > s ? "bg-blue-600" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="max-w-2xl mx-auto">
            {/* Step 1: Contact Information */}
            {step === 1 && (
              <div className="bg-white rounded-2xl p-8 shadow-sm" data-testid="step-1">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Contact Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Your Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your full name"
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => updateForm("company_name", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your company name"
                      data-testid="input-company"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateForm("phone", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="+91 98765 43210"
                      data-testid="input-phone"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Number *</label>
                    <input
                      type="text"
                      value={formData.gst_number}
                      onChange={(e) => updateForm("gst_number", e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 22AAAAA0000A1Z5"
                      data-testid="input-gst"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateForm("email", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!formData.name || !formData.phone || !formData.company_name || !formData.gst_number) {
                      toast.error("Please fill in all required fields including GST number");
                      return;
                    }
                    setStep(2);
                  }}
                  className="mt-8 w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  data-testid="next-step-1"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            )}

            {/* Step 2: Fabric Requirements */}
            {step === 2 && (
              <div className="bg-white rounded-2xl p-8 shadow-sm" data-testid="step-2">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Fabric Requirements</h2>
                <div className="space-y-6">
                  
                  {/* Search Bar */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Search or Describe What You Need
                    </label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg"
                        placeholder="e.g., Cotton shirting fabric for summer collection"
                        data-testid="search-input"
                      />
                    </div>
                  </div>

                  {/* Popular Tags */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Tag size={16} />
                        Quick Tags - Select all that apply
                      </label>
                      {selectedTags.length > 0 && (
                        <button
                          onClick={clearAllTags}
                          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                        >
                          <X size={14} />
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {popularTags.map((tag) => (
                        <button
                          key={tag.label}
                          onClick={() => toggleTag(tag.label)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                            selectedTags.includes(tag.label)
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : tagColors[tag.category]
                          }`}
                          data-testid={`tag-${tag.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {selectedTags.includes(tag.label) && (
                            <CheckCircle2 size={14} className="inline mr-1" />
                          )}
                          {tag.label}
                        </button>
                      ))}
                    </div>
                    {selectedTags.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                          <span className="font-medium">Selected:</span> {selectedTags.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-4">Or choose from options below</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Fabric Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        onClick={() => updateForm("category_id", "")}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                          !formData.category_id ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        Any Category
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => updateForm("category_id", cat.id)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.category_id === cat.id ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Fabric Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {fabricTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => updateForm("fabric_type", type)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.fabric_type === type ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">GSM Range</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {gsmRanges.map((range) => (
                        <button
                          key={range}
                          onClick={() => updateForm("gsm_range", range)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.gsm_range === range ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Composition Preference</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {compositions.map((comp) => (
                        <button
                          key={comp}
                          onClick={() => updateForm("composition_preference", comp)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.composition_preference === comp ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {comp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-slate-200 text-slate-700 py-4 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    data-testid="next-step-2"
                  >
                    Continue
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: End Use & Quantity */}
            {step === 3 && (
              <div className="bg-white rounded-2xl p-8 shadow-sm" data-testid="step-3">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Usage & Quantity</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">End Use / Application</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {endUses.map((use) => (
                        <button
                          key={use}
                          onClick={() => updateForm("end_use", use)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.end_use === use ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {use}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quantity Needed</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {quantities.map((qty) => (
                        <button
                          key={qty}
                          onClick={() => updateForm("quantity_needed", qty)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.quantity_needed === qty ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {qty}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Budget Range (per meter)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {budgets.map((budget) => (
                        <button
                          key={budget}
                          onClick={() => updateForm("budget_range", budget)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            formData.budget_range === budget ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          {budget}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Additional Notes</label>
                    <textarea
                      value={formData.additional_notes}
                      onChange={(e) => updateForm("additional_notes", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                      placeholder="Any specific requirements, colors, finishes, etc."
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 border border-slate-200 text-slate-700 py-4 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      fetchRecommendations();
                      setStep(4);
                    }}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    data-testid="next-step-3"
                  >
                    See Recommendations
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Recommendations & Submit */}
            {step === 4 && (
              <div data-testid="step-4">
                <div className="bg-white rounded-2xl p-8 shadow-sm mb-8">
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">Recommended Fabrics</h2>
                  <p className="text-slate-600 mb-6">Select any fabrics you're interested in (optional)</p>
                  
                  {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="aspect-square bg-slate-100 animate-pulse rounded-lg" />
                      ))}
                    </div>
                  ) : recommendedFabrics.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {recommendedFabrics.map((fabric) => (
                        <button
                          key={fabric.id}
                          onClick={() => toggleFabricSelection(fabric.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            formData.selected_fabrics.includes(fabric.id) 
                              ? "border-blue-600 ring-2 ring-blue-200" 
                              : "border-transparent hover:border-slate-200"
                          }`}
                        >
                          <img
                            src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=300"}
                            alt={fabric.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className="text-white text-xs font-medium line-clamp-2">{fabric.name}</p>
                            {fabric.gsm > 0 && <p className="text-white/70 text-xs">{fabric.gsm} GSM</p>}
                          </div>
                          {formData.selected_fabrics.includes(fabric.id) && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <CheckCircle2 size={16} className="text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-8">No matching fabrics found. Our team will help you find the right options.</p>
                  )}
                </div>

                {/* Submit Options */}
                <div className="bg-white rounded-2xl p-8 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900 mb-6">Submit Your Request</h2>
                  
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 border border-slate-200 text-slate-700 py-4 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="submit-enquiry"
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                      <Send size={18} />
                    </button>
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-green-500 text-white py-4 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={18} />
                      Chat on WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AssistedSourcingPage;
