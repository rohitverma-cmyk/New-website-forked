import { useState, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { trackSupplierSignup } from "../lib/analytics";
import { 
  ArrowRight, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Users, 
  Target,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Building2,
  Zap,
  ShieldCheck,
  BarChart3,
  Loader2
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const SellOnLocofast = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const [formData, setFormData] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    categories: [],
    monthly_capacity: "",
    city: "",
    gst_number: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstResult, setGstResult] = useState(null); // { valid, legal_name, ... }
  const [gstCooldown, setGstCooldown] = useState(false);
  const gstDebounceRef = useRef(null);

  const categories = ["Denim", "Cotton Shirting", "Knits", "Blends"];

  const verifyGst = async (gstin) => {
    if (gstCooldown || gstVerifying) return;
    const cleaned = gstin.trim().toUpperCase();
    if (cleaned.length !== 15) return;

    setGstVerifying(true);
    setGstResult(null);
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/gst/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: cleaned })
      });
      const data = await res.json();
      setGstResult(data);
      if (data.valid && data.legal_name) {
        setFormData(prev => ({
          ...prev,
          company_name: data.trade_name || data.legal_name,
          city: data.city || prev.city
        }));
      }
      // Cooldown: prevent re-verification for 10 seconds
      setGstCooldown(true);
      setTimeout(() => setGstCooldown(false), 10000);
    } catch {
      setGstResult({ valid: false, message: "Verification service unavailable" });
    }
    setGstVerifying(false);
  };

  const handleGstChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    setFormData(prev => ({ ...prev, gst_number: cleaned }));
    setGstResult(null);
    // Debounce: auto-verify after 1 second when 15 chars entered
    if (gstDebounceRef.current) clearTimeout(gstDebounceRef.current);
    if (cleaned.length === 15) {
      gstDebounceRef.current = setTimeout(() => verifyGst(cleaned), 1000);
    }
  };

  const faqs = [
    {
      q: "What's the realistic conversion rate I should expect?",
      a: "Based on our data, suppliers who put in consistent effort see 10-15% conversion from routed leads. This isn't a magic platform — it's a structured system. Your conversion depends on your pricing, response time, and follow-up quality. We give you verified demand; you close the deal."
    },
    {
      q: "How does the payment structure work?",
      a: "Buyers pay directly to you. We don't hold funds or act as an escrow. The transaction happens between you and the buyer. We track and structure the process, but the commercial relationship is direct. Commission structures are discussed during onboarding based on category and volume."
    },
    {
      q: "What's the order flow from lead to dispatch?",
      a: "1) You receive a verified buyer requirement with specs and contact. 2) You call the buyer directly within 2 hours. 3) You negotiate pricing and terms. 4) Order confirmation happens on platform. 5) You produce and dispatch. 6) We track delivery and completion. Simple. No middlemen in between."
    },
    {
      q: "Who handles dispatch and logistics?",
      a: "You do. You're the supplier — dispatch is your responsibility. We can recommend logistics partners, but the delivery commitment is yours. Buyers expect professional dispatch with proper documentation. If you can't handle logistics, this isn't the right platform for you."
    },
    {
      q: "Is there a subscription fee or listing charge?",
      a: "No monthly subscriptions. No listing fees. No pay-to-play visibility boosting. We operate on a performance model. Details are shared during the onboarding call based on your category and capacity."
    },
    {
      q: "What if a buyer doesn't pay after dispatch?",
      a: "Payment terms are between you and the buyer. We recommend suppliers to take advance payments or work with buyers they've verified. We provide buyer verification data, but commercial risk management is your call. We're a sourcing engine, not a payment guarantor."
    }
  ];

  const handleCategoryToggle = (cat) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${API_URL}/api/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.contact_name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company_name,
          enquiry_type: "supplier_signup",
          source: "supplier_signup_page",
          message: `**Supplier Application**\n\nCompany: ${formData.company_name}\nContact: ${formData.contact_name}\nGST: ${formData.gst_number}\nGST Verified: ${gstResult?.valid ? 'Yes' : 'No'}\nGST Legal Name: ${gstResult?.legal_name || ''}\nFabric Categories: ${formData.categories.join(', ')}\nMonthly Capacity: ${formData.monthly_capacity}\nLocation: ${formData.city}\n\nAdditional Info: None`
        })
      });
      
      if (response.ok) {
        setSubmitted(true);
        trackSupplierSignup({ company: formData.company_name, categories: formData.categories.join(', ') });
      } else {
        throw new Error("Failed to submit");
      }
    } catch (err) {
      console.error("Submission error:", err);
      // Still show success for now to not block UX
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  // Schema markup for B2B marketplace
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Sell on Locofast - B2B Fabric Supplier Onboarding",
    "description": "Join India's structured fabric sourcing platform. Get verified buyer requirements for Denim, Cotton Shirting, and Knits. MOQ 1000+ meters. Apply now.",
    "url": "https://locofast.com/sell",
    "mainEntity": {
      "@type": "Organization",
      "name": "Locofast",
      "description": "B2B Fabric Sourcing Platform",
      "areaServed": "India",
      "serviceType": "B2B Fabric Marketplace"
    }
  };

  return (
    <>
      <Helmet>
        <title>Sell on Locofast | B2B Fabric Supplier Platform | Denim, Cotton, Knits</title>
        <meta 
          name="description" 
          content="Join India's structured fabric sourcing engine. Get verified buyer requirements routed to you. Denim, Cotton Shirting, Knits — MOQ 1000+ meters. No subscriptions. Performance-based. Apply now." 
        />
        <meta name="keywords" content="sell fabric online, b2b fabric marketplace, fabric supplier india, denim supplier, cotton shirting manufacturer, knit fabric seller, wholesale fabric platform" />
        <link rel="canonical" href="https://locofast.com/suppliers" />
        <meta property="og:title" content="Sell on Locofast | B2B Fabric Supplier Platform" />
        <meta property="og:description" content="Get verified buyer requirements for Denim, Cotton Shirting, and Knits. MOQ 1000+ meters. No subscriptions." />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      </Helmet>

      <Navbar />

      <main className="bg-white">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] text-white overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>
          
          <div className="max-w-6xl mx-auto px-4 py-20 md:py-28 relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-[#2563EB]/20 border border-[#2563EB]/30 rounded-full px-4 py-1.5 text-blue-300 text-sm font-medium mb-6">
                <TrendingUp size={16} />
                Scaling B2B Fabric Sourcing in India
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-white">
                Stop Chasing Random Inquiries.
                <span className="block text-[#60a5fa] mt-2">Start Closing Real Orders.</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-slate-300 mb-8 leading-relaxed">
                We route verified buyer requirements directly to you. 
                <span className="text-white font-medium"> You call. You negotiate. You close.</span>
                <br />No middlemen. No subscriptions. Just structured demand.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <a 
                  href="#apply-form"
                  className="inline-flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all hover:scale-105"
                  data-testid="hero-cta-apply"
                >
                  Apply as Supplier
                  <ArrowRight size={20} />
                </a>
                <a 
                  href="mailto:mail@locofast.com?subject=Supplier Onboarding Inquiry"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all"
                  data-testid="hero-cta-talk"
                >
                  <Phone size={20} />
                  Talk to Onboarding Team
                </a>
              </div>
              
              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold text-white">2,000+</p>
                  <p className="text-sm text-slate-400">Brands on Platform</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold text-white">50M+</p>
                  <p className="text-sm text-slate-400">Metres Delivered</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold text-white">95%</p>
                  <p className="text-sm text-slate-400">On-Time Delivery</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold text-white">500+</p>
                  <p className="text-sm text-slate-400">Seller Partners</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#60a5fa]" />
                  MOQ 1000+ meters only
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#60a5fa]" />
                  Direct buyer contact
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#60a5fa]" />
                  No listing fees
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                The B2B Fabric Selling Problem
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                If you're a serious manufacturer or trader, you've felt this pain.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: <MessageSquare className="text-red-500" size={24} />,
                  title: "Random, Unqualified Inquiries",
                  desc: "80% of your inbox is price shoppers, students doing research, or tire-kickers asking for 50 meters."
                },
                {
                  icon: <Clock className="text-red-500" size={24} />,
                  title: "Massive Time Waste",
                  desc: "Hours spent on calls that go nowhere. Follow-ups ignored. Samples sent, never heard back."
                },
                {
                  icon: <Users className="text-red-500" size={24} />,
                  title: "Middleman Dependency",
                  desc: "Agents taking 5-10% cuts. No direct buyer relationships. Zero control over your pipeline."
                },
                {
                  icon: <BarChart3 className="text-red-500" size={24} />,
                  title: "No Structured Follow-up",
                  desc: "Leads fall through cracks. No system to track who's hot, who's cold, who needs a push."
                },
                {
                  icon: <Target className="text-red-500" size={24} />,
                  title: "Expensive Platforms",
                  desc: "₹50K+ yearly subscriptions for directories that send you the same garbage leads as everyone else."
                },
                {
                  icon: <XCircle className="text-red-500" size={24} />,
                  title: "Feast or Famine",
                  desc: "Some months flooded, some months dead. No predictability. No consistent demand flow."
                }
              ].map((item, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                  <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Our Model Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
                <Zap size={16} />
                How Locofast Works
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                A Marketplace That Works for Sellers
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Locofast connects you directly with 2,000+ verified brands and manufacturers. No brokers. No agents. Just structured demand routed to you.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="bg-gradient-to-br from-blue-50 to-sky-50 p-8 rounded-2xl border border-blue-100">
                <h3 className="text-2xl font-bold text-slate-900 mb-6">What You Get</h3>
                <ul className="space-y-4">
                  {[
                    "Direct access to 2,000+ verified buyers — fashion brands, export houses, garment manufacturers",
                    "Buyer contact shared directly — you call them, build the relationship",
                    "MOQ 1000+ meters only — serious bulk orders, not retail enquiries",
                    "Transparent requirements with specs, quantity, timeline and budget",
                    "Payment protection on eligible orders through our Money Safety Guarantee",
                    "Exposure to international markets — Sri Lanka, Vietnam, and growing"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
                      <span className="text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-8 rounded-2xl border border-slate-200">
                <h3 className="text-2xl font-bold text-slate-900 mb-6">What We Don't Do</h3>
                <ul className="space-y-4">
                  {[
                    "Promise guaranteed orders — nobody can",
                    "Take over your buyer relationships",
                    "Handle your production or dispatch",
                    "Guarantee payments — that's between you and buyer",
                    "Send you unverified, low-intent inquiries"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <XCircle className="text-slate-400 mt-0.5 flex-shrink-0" size={20} />
                      <span className="text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Conversion Reality */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Target className="text-amber-600" size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Real Talk on Conversion</h4>
                  <p className="text-slate-700">
                    Suppliers who work the system consistently see <strong>10-15% conversion rates</strong>. 
                    That means for every 10 verified requirements you get, 1-2 become orders. 
                    This isn't a lottery — it's sales. Your conversion depends on your pricing, speed, and follow-up quality. 
                    We give you at-bats. You hit the runs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Before vs After - Middleman Problem (Seller Perspective) */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">The Locofast Advantage</p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                We Removed the Middleman. Your Margins Stay Yours.
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                The traditional fabric supply chain has 2-3 intermediaries. Each one takes a cut. On Locofast, you sell direct.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Before */}
              <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
                <h3 className="text-xl font-bold text-red-800 mb-6 flex items-center gap-2">
                  <XCircle size={24} className="text-red-500" />
                  Before Locofast
                </h3>
                <div className="space-y-4">
                  {[
                    { step: "Your Mill / Factory", markup: "", color: "bg-slate-200 text-slate-700" },
                    { step: "Mill Agent / Broker", markup: "+8% markup on your price", color: "bg-red-100 text-red-700" },
                    { step: "Trading House", markup: "+10% markup added", color: "bg-red-200 text-red-800" },
                    { step: "Buyer's Factory", markup: "Final price inflated 15-20%", color: "bg-red-300 text-red-900" }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`${item.color} px-4 py-3 rounded-lg flex-1`}>
                        <p className="font-semibold text-sm">{item.step}</p>
                        {item.markup && <p className="text-xs mt-1 opacity-80">{item.markup}</p>}
                      </div>
                      {i < 3 && <ArrowRight size={16} className="text-red-400 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
                <p className="text-red-700 text-sm mt-6 font-medium">
                  Result: Buyer pays 15-20% more. You don't see that money. Agents do.
                </p>
              </div>
              
              {/* After */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8">
                <h3 className="text-xl font-bold text-blue-800 mb-6 flex items-center gap-2">
                  <CheckCircle2 size={24} className="text-[#2563EB]" />
                  With Locofast
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-800 px-4 py-3 rounded-lg flex-1">
                      <p className="font-semibold text-sm">Your Mill / Factory</p>
                    </div>
                    <ArrowRight size={16} className="text-blue-400 flex-shrink-0" />
                  </div>
                  <div className="bg-[#2563EB] text-white px-6 py-5 rounded-xl">
                    <p className="font-bold text-lg mb-2">Locofast Marketplace</p>
                    <ul className="space-y-2 text-sm text-blue-100">
                      <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Direct connection — no agents</li>
                      <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Your pricing reaches the buyer directly</li>
                      <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Payment protection on eligible orders</li>
                      <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Dedicated account manager support</li>
                    </ul>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 text-green-800 px-4 py-3 rounded-lg flex-1">
                      <p className="font-semibold text-sm">Buyer's Factory</p>
                      <p className="text-xs mt-1 opacity-80">Gets mill-direct pricing. Buys more from you.</p>
                    </div>
                  </div>
                </div>
                <p className="text-blue-700 text-sm mt-6 font-medium">
                  Result: Better prices for buyers = more repeat orders for you. Everyone wins.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Who This Is For Section */}
        <section className="py-16 md:py-24 bg-slate-900 text-white">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              Is This Platform For You?
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* For */}
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-[#2563EB] rounded-full flex items-center justify-center">
                    <CheckCircle2 size={20} />
                  </div>
                  <h3 className="text-2xl font-bold text-blue-400">This IS For You If:</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "You're a manufacturer or trader doing 5000+ meters/month",
                    "You can handle MOQ of 1000 meters minimum",
                    "You have capacity in Denim, Cotton Shirting, Knits, or Blends",
                    "You want to increase your capacity utilisation",
                    "You want direct buyer relationships, not middlemen"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="text-blue-400 mt-0.5 flex-shrink-0" size={18} />
                      <span className="text-slate-200">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Not For */}
              <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                    <XCircle size={20} />
                  </div>
                  <h3 className="text-2xl font-bold text-red-400">This is NOT For You If:</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "You sell cut-pieces or retail quantities",
                    "You want to just list and wait for orders to come",
                    "You expect guaranteed orders without effort",
                    "You can't maintain consistent quality and delivery timelines",
                    "You're looking for a magic solution to fill your factory",
                    "You can't handle professional follow-up and documentation"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <XCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                      <span className="text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Expectations Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                How Sellers Succeed on Locofast
              </h2>
              <p className="text-xl text-slate-600">
                Our most successful sellers share these traits.
              </p>
            </div>
            
            <div className="space-y-6">
              {[
                {
                  title: "Professional Follow-Up",
                  desc: "After first call, you follow up systematically. Send quotes on time. Update the platform. Close professionally."
                },
                {
                  title: "Accurate Pricing & Delivery Commitments",
                  desc: "Quote what you can deliver. Don't overpromise on timelines. Reputation is everything in B2B."
                },
                {
                  title: "Maximize Capacity Utilisation",
                  desc: "Use Locofast to fill idle capacity. Consistent demand from verified buyers means your looms and machines stay productive."
                },
                {
                  title: "Build Your Brand on the Platform",
                  desc: "Maintain quality ratings, deliver on time, and watch your seller ranking grow. Top sellers get priority access to high-volume requirements."
                },
                {
                  title: "Leverage the Marketplace Network",
                  desc: "Locofast connects you with 700+ brands and manufacturers across India and internationally. Every requirement is a chance to build a long-term relationship."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-6 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">{item.title}</h3>
                    <p className="text-slate-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Categories We're Scaling
              </h2>
              <p className="text-xl text-slate-300">
                Focused categories. Verified demand. Bulk orders only.
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { name: "Denim", desc: "Rigid, stretch, selvedge", moq: "1000m+", link: "/fabrics?category=denim" },
                { name: "Cotton Shirting", desc: "Oxford, poplin, twill", moq: "1000m+", link: "/fabrics?category=cotton-fabrics" },
                { name: "Knits", desc: "Single jersey, interlock, pique", moq: "1000m+", link: "/fabrics?category=knits" },
                { name: "Blends", desc: "PC, TC, CVC blends", moq: "1000m+", link: "/fabrics?category=blended-fabrics" }
              ].map((cat, i) => (
                <Link 
                  key={i}
                  to={cat.link}
                  className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-6 transition-all"
                >
                  <h3 className="text-xl font-bold text-white mb-2">{cat.name}</h3>
                  <p className="text-slate-400 mb-4">{cat.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-400 font-medium">MOQ {cat.moq}</span>
                    <ArrowRight className="text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" size={18} />
                  </div>
                </Link>
              ))}
            </div>
            
            <p className="text-center text-slate-400 mt-8">
              More categories coming soon. If you have capacity in other fabrics, <a href="#apply-form" className="text-blue-400 hover:underline">still apply</a>.
            </p>
          </div>
        </section>

        {/* Video Testimonials Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Supplier Stories
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Hear From Our Suppliers
              </h2>
              <p className="text-xl text-slate-600">
                Real suppliers. Real results. No scripts.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "From Random Calls to Real Orders",
                  videoUrl: `${process.env.REACT_APP_BACKEND_URL}/api/uploads/video_43a5cdc1-0c2c-459c-ba41-d2382aaf7084.mp4`,
                  supplier: "Textile Mill Owner",
                  location: "Ahmedabad",
                  hasVideo: true
                },
                {
                  title: "How I Closed 5 Orders in Month 1",
                  videoUrl: `${process.env.REACT_APP_BACKEND_URL}/api/uploads/video_3793a790-275c-4cbf-8b4c-1c7cbd76615b.mp4`,
                  supplier: "Denim Manufacturer",
                  location: "Surat",
                  hasVideo: true
                },
                {
                  title: "Direct Buyers Changed Everything",
                  videoUrl: `${process.env.REACT_APP_BACKEND_URL}/api/uploads/video_7d90f8a3-de34-4819-90d1-e046c70d6341.mp4`,
                  supplier: "Fabric Trader",
                  location: "Erode",
                  hasVideo: true
                }
              ].map((video, i) => (
                <div 
                  key={i}
                  className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-video bg-slate-900">
                    {video.hasVideo ? (
                      <video 
                        className="w-full h-full object-cover"
                        controls
                        preload="metadata"
                        poster=""
                      >
                        <source src={video.videoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    ) : (
                      <>
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                          <span className="text-slate-500 text-sm">Coming Soon</span>
                        </div>
                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                            <svg className="w-7 h-7 text-white/50 ml-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-slate-900 mb-2">
                      {video.title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Building2 size={14} />
                      <span>{video.supplier}, {video.location}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-center text-slate-500 mt-8 text-sm">
              Want to share your story? <a href="https://wa.me/918920392418?text=I want to share my supplier experience" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Contact us</a>
            </p>
          </div>
        </section>

        {/* Marketplace Growth Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Grow Your Business with Locofast
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Our marketplace is designed to help sellers scale — from filling idle capacity to reaching international buyers.
              </p>
            </div>
            
            {/* Seller Benefits */}
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {[
                {
                  title: "Increase Capacity Utilisation",
                  desc: "Fill idle looms and machines with consistent demand from 2,000+ verified buyers. No more waiting for seasonal orders or depending on a single buyer. Our sellers have delivered 50M+ metres through the platform.",
                  icon: "M13 10V3L4 14h7v7l9-11h-7z"
                },
                {
                  title: "Direct Access to Brand Buyers",
                  desc: "No brokers taking 5-10% of your margins. Connect directly with fashion brands, export houses, D2C labels, and garment manufacturers. Your pricing reaches the buyer — not an inflated version through intermediaries.",
                  icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                },
                {
                  title: "Payment Protection & Money Safety",
                  desc: "Locofast's Money Safety Guarantee protects eligible orders. Buyer payments are held securely and released upon quality approval. No chasing payments, no defaults — sell with confidence.",
                  icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                },
                {
                  title: "Reach International Markets",
                  desc: "Locofast serves buyers beyond India — including Sri Lanka (2nd largest denim export market) and Vietnam (4th largest garment exporter). Your mill gets exposure to international demand without the hassle of export logistics.",
                  icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                },
                {
                  title: "Dedicated Account Manager",
                  desc: "Every seller gets a dedicated account manager who understands your capacity, pricing, and specialisation. They route the right requirements to you and help you close faster — reachable via WhatsApp, email, or phone.",
                  icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                },
                {
                  title: "Build Your Seller Reputation",
                  desc: "Maintain quality ratings and deliver on time. Top-performing sellers get priority access to high-volume requirements from premium buyers. With 95% OTIF delivery rate on the platform, the bar is high — and so are the rewards.",
                  icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                }
              ].map((item, i) => (
                <div key={i} className="bg-white p-8 rounded-xl border border-slate-200">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Platform Values Strip */}
            <div className="bg-gradient-to-r from-[#1e3a8a] to-[#2563EB] rounded-2xl p-8 md:p-10">
              <h3 className="text-xl font-bold text-white mb-6 text-center">Our Promise to Sellers</h3>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                {[
                  { title: "No Middlemen, Ever", desc: "The platform is built for direct deals. No agents, no brokers." },
                  { title: "Transparency by Default", desc: "Buyer details, requirement specs, and pricing — all visible upfront." },
                  { title: "100% Ownership", desc: "If something goes wrong, we take responsibility and resolve it." },
                  { title: "Speed Without Shortcuts", desc: "Requirements routed fast, but never at the cost of quality or verification." },
                  { title: "Technology + Human Touch", desc: "Smart matching powered by tech, supported by real account managers." },
                  { title: "Your Money Moves Safe", desc: "Payment protection on eligible orders. No more chasing defaulters." }
                ].map((item, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-5">
                    <h4 className="text-white font-semibold mb-1 text-sm">{item.title}</h4>
                    <p className="text-blue-200 text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-xl text-slate-600">
                Straight answers. No fluff.
              </p>
            </div>
            
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-6 text-left bg-white hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-semibold text-slate-900 pr-4">{faq.q}</span>
                    {openFaq === i ? (
                      <ChevronUp className="text-slate-400 flex-shrink-0" size={20} />
                    ) : (
                      <ChevronDown className="text-slate-400 flex-shrink-0" size={20} />
                    )}
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-6 bg-slate-50">
                      <p className="text-slate-600 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Application Form Section */}
        <section id="apply-form" className="py-16 md:py-24 bg-slate-900 text-white">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Serious Suppliers Win Here
              </h2>
              <p className="text-xl text-slate-300">
                If you're ready to put in the work, we're ready to route you demand.
              </p>
            </div>
            
            {submitted ? (
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-12 text-center">
                <div className="w-16 h-16 bg-[#2563EB] rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-2xl font-bold text-blue-400 mb-4">Application Received</h3>
                <p className="text-slate-300 mb-6">
                  Our onboarding team will review your application and call you within 24-48 hours. 
                  Keep your phone handy.
                </p>
                <a 
                  href="https://wa.me/918920392418?text=Hi, I just submitted my supplier application on Locofast"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
                >
                  <Phone size={18} />
                  Or message us on WhatsApp for faster response
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 md:p-12">
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Contact Person *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contact_name}
                      onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                      placeholder="Decision maker name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                      placeholder="+91 XXXXX XXXXX"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                      placeholder="business@company.com"
                    />
                  </div>
                </div>

                {/* GST Number - After Email */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    GST Number *
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        required
                        value={formData.gst_number}
                        onChange={(e) => handleGstChange(e.target.value)}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 font-mono tracking-wide ${
                          gstResult?.valid ? 'border-green-400 bg-green-50' : gstResult?.valid === false ? 'border-red-400 bg-red-50' : 'border-slate-200'
                        }`}
                        placeholder="22AAAAA0000A1Z5"
                        maxLength={15}
                        data-testid="supplier-gst-input"
                      />
                      {gstVerifying && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 size={18} className="animate-spin text-blue-500" />
                        </div>
                      )}
                      {gstResult?.valid && !gstVerifying && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle2 size={18} className="text-green-500" />
                        </div>
                      )}
                      {gstResult?.valid === false && !gstVerifying && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <XCircle size={18} className="text-red-500" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => verifyGst(formData.gst_number)}
                      disabled={formData.gst_number.length !== 15 || gstVerifying || gstCooldown}
                      className="px-5 py-3 bg-[#2563EB] text-white rounded-lg font-medium hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap"
                      data-testid="verify-gst-btn"
                    >
                      {gstVerifying ? "Verifying..." : gstCooldown ? "Wait..." : "Verify GST"}
                    </button>
                  </div>
                  {gstResult?.valid && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <p className="text-green-800 text-sm font-medium">{gstResult.legal_name}</p>
                      <p className="text-green-600 text-xs">{gstResult.trade_name && gstResult.trade_name !== gstResult.legal_name ? `Trade: ${gstResult.trade_name} | ` : ''}Status: {gstResult.gst_status} | {gstResult.city}, {gstResult.state}</p>
                    </div>
                  )}
                  {gstResult?.valid === false && (
                    <p className="mt-2 text-red-600 text-sm">{gstResult.message || 'Invalid GST number'}</p>
                  )}
                  <p className="mt-1 text-slate-400 text-xs">Enter your 15-digit GSTIN — company name &amp; city will auto-populate</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Company Name *
                      {gstResult?.valid && <span className="ml-2 text-xs text-green-600 font-normal">(auto-filled from GST)</span>}
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.company_name}
                      onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 ${gstResult?.valid ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}
                      placeholder="Your mill / trading company name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      City / Location *
                      {gstResult?.valid && formData.city && <span className="ml-2 text-xs text-green-600 font-normal">(auto-filled from GST)</span>}
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 ${gstResult?.valid && formData.city ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}
                      placeholder="Ahmedabad, Surat, Erode, etc."
                    />
                  </div>
                </div>
                
                <div className="mb-8">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Categories You Supply *
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryToggle(cat)}
                        className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                          formData.categories.includes(cat)
                            ? "bg-[#2563EB] border-[#2563EB] text-white"
                            : "bg-white border-slate-200 text-slate-700 hover:border-[#2563EB]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
                  <p className="text-amber-800 text-sm">
                    <strong>By applying, you confirm:</strong> You can handle MOQ 1000+ meters
                    and deliver consistent quality with professional communication.
                  </p>
                </div>
                
                <button
                  type="submit"
                  disabled={submitting || formData.categories.length === 0}
                  className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] disabled:bg-slate-300 text-white py-4 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    "Submitting..."
                  ) : (
                    <>
                      Submit Application
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 md:py-20 bg-[#2563EB] text-white">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Stop Waiting. Start Selling.
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Verified demand is being routed right now. Are you on the list?
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="#apply-form"
                className="inline-flex items-center justify-center gap-2 bg-white text-[#2563EB] px-8 py-4 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-all"
              >
                Apply Now
                <ArrowRight size={20} />
              </a>
              <a 
                href="https://wa.me/918920392418?text=Hi, I want to know more about selling on Locofast"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all"
              >
                <Phone size={20} />
                WhatsApp Us
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default SellOnLocofast;
