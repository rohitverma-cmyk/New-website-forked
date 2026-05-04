import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, CheckCircle, Send } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const RFQPage = () => {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const [form, setForm] = useState({
    category: "",
    // Cotton & Viscose specific
    fabric_requirement_type: "",
    // Cotton, Viscose, Denim specific (meters)
    quantity_meters: "",
    // Knits specific
    knit_quality: "",
    quantity_kg: "",
    // Denim specific
    denim_specification: "",
    // Common fields
    gst_number: "",
    full_name: "",
    email: "",
    phone: "",
    website: "",
    message: ""
  });

  const categories = [
    { id: "cotton", name: "Cotton", icon: "🧵" },
    { id: "knits", name: "Knits", icon: "🧶" },
    { id: "denim", name: "Denim", icon: "👖" },
    { id: "viscose", name: "Viscose", icon: "✨" }
  ];

  const fabricRequirementTypes = ["Greige", "Dyed", "RFD", "Printed"];

  const cottonQuantityOptions = [
    { value: "less_than_1000", label: "Less than 1000 m (not serviced)", disabled: true },
    { value: "1000_5000", label: "1,000 - 5,000 m" },
    { value: "5000_20000", label: "5,000 - 20,000 m" },
    { value: "20000_50000", label: "20,000 - 50,000 m" },
    { value: "50000_plus", label: "50,000 m+" }
  ];

  const knitQualityOptions = [
    "4 Way Lycra 220-230 GSM",
    "Rice Knit 130-170 GSM",
    "Dot Knit 130-170 GSM",
    "PP Micro 110-130 GSM",
    "Mulberry Fabric 150-220 GSM",
    "Taiwan Lycra 250-270 GSM",
    "Tintin (Non-Spandex) 190 GSM",
    "Malai Fabric (Full Dull Yarn) 8-10% Spandex 170-190 GSM",
    "Malai Fabric (Full Dull Yarn) Non Spandex 170-190 GSM",
    "Others"
  ];

  const knitQuantityOptions = [
    { value: "less_than_200", label: "Less than 200 kg" },
    { value: "200_500", label: "200 - 500 kg" },
    { value: "500_1000", label: "500 - 1,000 kg" },
    { value: "1000_plus", label: "1,000 kg+" }
  ];

  const denimQuantityOptions = [
    { value: "less_than_1000", label: "Less than 1000 m (not serviced)", disabled: true },
    { value: "1000_2500", label: "1,000 - 2,500 m" },
    { value: "2500_7500", label: "2,500 - 7,500 m" },
    { value: "7500_25000", label: "7,500 - 25,000 m" },
    { value: "25000_plus", label: "25,000 m+" }
  ];

  const denimSpecificationOptions = [
    "65% Cotton 35% Poly 4.5oz, 64\" cw, Shirting Fabric",
    "78% Cotton 20% Poly 2% Spandex 9.5oz, 70\" cw, Bottom Weight",
    "100% Cotton 4.5oz, 64\" cw, Shirting Fabric",
    "100% Cotton 12oz, 65\" cw, Bottom Weight",
    "70% Cotton 30% Poly 6.25oz, 64\" cw, Shirting Fabric",
    "100% Cotton 13oz, 65\" cw, Bottom Weight",
    "Other Specification"
  ];

  const handleCategorySelect = (categoryId) => {
    setForm({ ...form, category: categoryId });
    setStep(2);
  };

  const handleInputChange = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const validateStep2 = () => {
    if (form.category === "cotton" || form.category === "viscose") {
      if (!form.fabric_requirement_type) {
        toast.error("Please select fabric requirement type");
        return false;
      }
      if (!form.quantity_meters) {
        toast.error("Please select quantity requirement");
        return false;
      }
    } else if (form.category === "knits") {
      if (!form.knit_quality) {
        toast.error("Please select knit quality");
        return false;
      }
      if (!form.quantity_kg) {
        toast.error("Please select quantity requirement");
        return false;
      }
    } else if (form.category === "denim") {
      if (!form.quantity_meters) {
        toast.error("Please select quantity requirement");
        return false;
      }
      if (!form.denim_specification) {
        toast.error("Please select specification");
        return false;
      }
    }
    return true;
  };

  const validateStep3 = () => {
    if (!form.full_name) {
      toast.error("Please enter your full name");
      return false;
    }
    if (!form.email) {
      toast.error("Please enter your email");
      return false;
    }
    if (!form.phone) {
      toast.error("Please enter your phone number");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;

    setSubmitting(true);
    try {
      // Build the RFQ data with category-specific fields
      const rfqData = {
        category: form.category,
        fabric_requirement_type: form.fabric_requirement_type,
        quantity_meters: form.quantity_meters,
        quantity_kg: form.quantity_kg,
        knit_quality: form.knit_quality,
        denim_specification: form.denim_specification,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        gst_number: form.gst_number,
        website: form.website,
        message: form.message
      };

      const response = await fetch(`${API_URL}/api/rfq/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rfqData)
      });

      if (response.ok) {
        const result = await response.json();
        setSubmitted(true);
        toast.success(`RFQ ${result.rfq_number} submitted successfully!`);
      } else {
        const error = await response.json();
        throw new Error(error.detail || "Failed to submit");
      }
    } catch (err) {
      toast.error(err.message || "Failed to submit RFQ. Please try again.");
    }
    setSubmitting(false);
  };

  const buildMessage = () => {
    let msg = `**RFQ Submission**\n\n`;
    msg += `Category: ${form.category.toUpperCase()}\n`;
    
    if (form.category === "cotton" || form.category === "viscose") {
      msg += `Fabric Requirement Type: ${form.fabric_requirement_type}\n`;
      msg += `Quantity: ${cottonQuantityOptions.find(o => o.value === form.quantity_meters)?.label || form.quantity_meters}\n`;
    } else if (form.category === "knits") {
      msg += `Quality: ${form.knit_quality}\n`;
      msg += `Quantity: ${knitQuantityOptions.find(o => o.value === form.quantity_kg)?.label || form.quantity_kg}\n`;
    } else if (form.category === "denim") {
      msg += `Specification: ${form.denim_specification}\n`;
      msg += `Quantity: ${denimQuantityOptions.find(o => o.value === form.quantity_meters)?.label || form.quantity_meters}\n`;
    }
    
    if (form.gst_number) {
      msg += `GST Number: ${form.gst_number}\n`;
    }
    if (form.website) {
      msg += `Website: ${form.website}\n`;
    }
    if (form.message) {
      msg += `\nAdditional Notes: ${form.message}\n`;
    }
    
    return msg;
  };

  const getCategoryName = () => {
    return categories.find(c => c.id === form.category)?.name || "";
  };

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Helmet>
          <title>RFQ Submitted | Locofast</title>
        </Helmet>
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="max-w-md mx-auto text-center px-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} className="text-green-600" />
            </div>
            <h1 className="text-3xl font-semibold text-neutral-900 mb-4">RFQ Submitted!</h1>
            <p className="text-neutral-600 mb-8">
              Thank you for your inquiry. Our team will review your requirements and get back to you within 24-48 hours with the best-matched seller options.
            </p>
            <div className="space-y-3">
              <Link
                to="/fabrics"
                className="inline-flex items-center justify-center gap-2 bg-[#2563EB] text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors w-full"
              >
                Instant Booking
              </Link>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors w-full py-2"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Helmet>
        <title>Request for Quote (RFQ) | Locofast - B2B Fabric Sourcing</title>
        <meta name="description" content="Submit your fabric requirements and get matched with the best sellers. Cotton, Knits, Denim, Viscose - all fabric types available." />
      </Helmet>
      <Navbar />
      
      <main className="flex-1 py-12 lg:py-20">
        <div className="max-w-3xl mx-auto px-6">
          {/* Back button */}
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-8 transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
          )}

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s ? "bg-[#2563EB] text-white" : "bg-neutral-200 text-neutral-500"
                }`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-12 h-1 rounded ${step > s ? "bg-[#2563EB]" : "bg-neutral-200"}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Category Selection */}
          {step === 1 && (
            <div data-testid="rfq-step-1">
              <h1 className="text-3xl font-semibold text-neutral-900 mb-2">Request for Quote</h1>
              <p className="text-neutral-600 mb-8">Select the fabric category you're looking for</p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className="bg-white p-6 rounded-xl border-2 border-neutral-200 hover:border-[#2563EB] transition-colors text-left group"
                    data-testid={`category-${category.id}`}
                  >
                    <span className="text-3xl mb-3 block">{category.icon}</span>
                    <h3 className="text-xl font-semibold text-neutral-900 group-hover:text-[#2563EB] transition-colors">
                      {category.name}
                    </h3>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Category-specific requirements */}
          {step === 2 && (
            <div data-testid="rfq-step-2">
              <h1 className="text-3xl font-semibold text-neutral-900 mb-2">
                {getCategoryName()} Requirements
              </h1>
              <p className="text-neutral-600 mb-8">Tell us about your specific needs</p>

              <div className="bg-white p-6 lg:p-8 rounded-xl border border-neutral-200 space-y-6">
                {/* Cotton & Viscose: Fabric Requirement Type */}
                {(form.category === "cotton" || form.category === "viscose") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What is your fabric requirement type? <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {fabricRequirementTypes.map((type) => (
                          <button
                            key={type}
                            onClick={() => handleInputChange("fabric_requirement_type", type)}
                            className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                              form.fabric_requirement_type === type
                                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What is your ideal fabric requirement? <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {cottonQuantityOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => !option.disabled && handleInputChange("quantity_meters", option.value)}
                            disabled={option.disabled}
                            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-left transition-colors ${
                              option.disabled
                                ? "border-neutral-100 bg-neutral-50 text-neutral-400 cursor-not-allowed"
                                : form.quantity_meters === option.value
                                  ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                  : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Knits: Quality & Quantity */}
                {form.category === "knits" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What quality are you looking for? <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {knitQualityOptions.map((quality) => (
                          <button
                            key={quality}
                            onClick={() => handleInputChange("knit_quality", quality)}
                            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-left transition-colors ${
                              form.knit_quality === quality
                                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {quality}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What is your ideal fabric requirement? <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {knitQuantityOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleInputChange("quantity_kg", option.value)}
                            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-left transition-colors ${
                              form.quantity_kg === option.value
                                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Denim: Quantity & Specification */}
                {form.category === "denim" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What is your ideal fabric requirement? <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {denimQuantityOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => !option.disabled && handleInputChange("quantity_meters", option.value)}
                            disabled={option.disabled}
                            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-left transition-colors ${
                              option.disabled
                                ? "border-neutral-100 bg-neutral-50 text-neutral-400 cursor-not-allowed"
                                : form.quantity_meters === option.value
                                  ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                  : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-3">
                        What specification are you looking for? <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {denimSpecificationOptions.map((spec) => (
                          <button
                            key={spec}
                            onClick={() => handleInputChange("denim_specification", spec)}
                            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-left transition-colors ${
                              form.denim_specification === spec
                                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            {spec}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <button
                  onClick={handleNext}
                  className="w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Contact Details */}
          {step === 3 && (
            <div data-testid="rfq-step-3">
              <h1 className="text-3xl font-semibold text-neutral-900 mb-2">Contact Details</h1>
              <p className="text-neutral-600 mb-8">How can we reach you?</p>

              <div className="bg-white p-6 lg:p-8 rounded-xl border border-neutral-200 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => handleInputChange("full_name", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors"
                    placeholder="Enter your full name"
                    data-testid="rfq-fullname"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors"
                    placeholder="you@company.com"
                    data-testid="rfq-email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors"
                    placeholder="+91 98765 43210"
                    data-testid="rfq-phone"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Website <span className="text-neutral-400">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => handleInputChange("website", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors"
                    placeholder="https://yourcompany.com"
                    data-testid="rfq-website"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    GST Number <span className="text-neutral-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.gst_number}
                    onChange={(e) => handleInputChange("gst_number", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors"
                    placeholder="22AAAAA0000A1Z5"
                    data-testid="rfq-gst"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Additional Notes <span className="text-neutral-400">(Optional)</span>
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors resize-none"
                    placeholder="Any specific requirements or questions..."
                    data-testid="rfq-message"
                  />
                </div>

                {/* Summary */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">Your Request Summary</p>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p><span className="font-medium">Category:</span> {getCategoryName()}</p>
                    {(form.category === "cotton" || form.category === "viscose") && (
                      <>
                        <p><span className="font-medium">Type:</span> {form.fabric_requirement_type}</p>
                        <p><span className="font-medium">Quantity:</span> {cottonQuantityOptions.find(o => o.value === form.quantity_meters)?.label}</p>
                      </>
                    )}
                    {form.category === "knits" && (
                      <>
                        <p><span className="font-medium">Quality:</span> {form.knit_quality}</p>
                        <p><span className="font-medium">Quantity:</span> {knitQuantityOptions.find(o => o.value === form.quantity_kg)?.label}</p>
                      </>
                    )}
                    {form.category === "denim" && (
                      <>
                        <p><span className="font-medium">Specification:</span> {form.denim_specification}</p>
                        <p><span className="font-medium">Quantity:</span> {denimQuantityOptions.find(o => o.value === form.quantity_meters)?.label}</p>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="rfq-submit"
                >
                  {submitting ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send size={18} />
                      Submit RFQ
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RFQPage;
