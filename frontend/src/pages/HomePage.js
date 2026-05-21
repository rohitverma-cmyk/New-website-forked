import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, MessageCircle, Shield, Clock, Users, ChevronDown, ChevronUp, Sparkles, Factory, Store, Layers, Building2, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar";
import RFQModal from "../components/RFQModal";
import HeroSearchCard from "../components/HeroSearchCard";
import BrandTicker from "../components/BrandTicker";
import { getCollections } from "../lib/api";
import { trackRFQIntent } from "../lib/analytics";
import CreditApplicationSection from "../components/CreditApplicationSection";

const HomePage = () => {
  const [collections, setCollections] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);
  const [showRfqModal, setShowRfqModal] = useState(false);

  useEffect(() => {
    fetchCollections();
    // Handle #apply-credit hash navigation
    if (window.location.hash === '#apply-credit') {
      setTimeout(() => {
        document.querySelector('[data-testid="credit-section"]')?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, []);

  const fetchCollections = async () => {
    try {
      const res = await getCollections();
      setCollections(res.data.slice(0, 4));
    } catch (err) {
      console.error("Failed to fetch collections");
    }
  };

  const valueProps = [
    {
      icon: Shield,
      title: "500+ Verified Seller Partners",
      description: "Access a curated network of verified textile sellers across India. Every partner is vetted for quality and reliability."
    },
    {
      icon: CheckCircle,
      title: "Transparent MOQ & Pricing",
      description: "No hidden costs. Clear minimum order quantities and pricing displayed upfront on every fabric listing."
    },
    {
      icon: ShieldCheck,
      title: "Money Safety Guarantee",
      description: "Locofast's secure payment system ensures your money is protected. Pay with confidence knowing your transactions are safeguarded."
    }
  ];

  const steps = [
    {
      number: "01",
      title: "Browse or Submit Your Requirement",
      description: "Explore our catalog of fabrics or share your specific needs — type, quantity, budget, and timeline.",
      cta: "Instant Booking"
    },
    {
      number: "02",
      title: "Get Matched Instantly",
      description: "Our platform intelligently connects your requirements with the best-suited seller partners from our verified network.",
      cta: "How Matching Works"
    },
    {
      number: "03",
      title: "Order with Confidence",
      description: "Compare options, request samples, and place orders with complete transparency on pricing and delivery timelines.",
      cta: "Start Now"
    }
  ];

  const testimonials = [
    {
      quote: "Locofast has transformed how we source fabrics. The platform connects us directly with verified sellers — no middlemen, no delays.",
      author: "Garment Manufacturer",
      location: "Bangladesh"
    },
    {
      quote: "Finally, a platform that understands B2B fabric sourcing. The money safety guarantee gives us peace of mind on every order.",
      author: "Fashion Brand",
      location: "Delhi"
    },
    {
      quote: "The clarity on MOQ and pricing saved us weeks of back-and-forth. Our sourcing time has reduced by 60%.",
      author: "Export Manufacturer",
      location: "Sri Lanka"
    },
    {
      quote: "As a private label business, we need reliable suppliers fast. Locofast's platform delivers quality matches within hours.",
      author: "Private Label",
      location: "Mumbai"
    }
  ];

  const audiences = [
    {
      icon: Store,
      title: "Fashion Brands",
      description: "D2C labels, boutique brands, and fashion houses looking for reliable fabric sourcing partners."
    },
    {
      icon: Factory,
      title: "Garment Manufacturers",
      description: "Garment manufacturers and export houses needing consistent quality fabrics at scale."
    },
    {
      icon: Building2,
      title: "Buying Houses",
      description: "Sourcing agencies and buying houses connecting international brands with Indian textiles."
    },
    {
      icon: Layers,
      title: "Private Label",
      description: "Private label businesses and white-label manufacturers seeking quality fabric suppliers."
    }
  ];

  const faqs = [
    {
      question: "Can I get samples before placing a bulk order?",
      answer: "Yes, absolutely. Most seller partners on our platform offer sampling. Sample costs vary by fabric type and seller, and are typically adjusted against your final order."
    },
    {
      question: "What is the minimum order quantity (MOQ)?",
      answer: "MOQ varies by seller partner and fabric type, typically ranging from 300-1500 meters. Every listing clearly shows MOQ upfront so there are no surprises."
    },
    {
      question: "How does the Money Safety Guarantee work?",
      answer: "Your payments are held securely until you confirm receipt and satisfaction with your order. This ensures sellers are incentivized to deliver quality, and buyers have peace of mind."
    },
    {
      question: "How fast is delivery?",
      answer: "Lead times range from 15-45 days depending on the fabric and seller location. Each listing shows estimated delivery timelines before you order."
    },
    {
      question: "How does pricing work?",
      answer: "Pricing is set by seller partners and displayed transparently per meter/kg. What you see is what you pay — no hidden platform fees for buyers."
    }
  ];

  const trustBadges = [
    { label: "500+ Seller Partners", icon: Users },
    { label: "Verified Suppliers", icon: Shield },
    { label: "Money Safety Guarantee", icon: ShieldCheck }
  ];

  return (
    <>
      <Navbar />
      
      <main className="bg-white" data-testid="home-page">
        
        {/* ========== HERO SECTION ========== */}
        <section className="relative min-h-[90vh] flex items-center bg-gradient-to-br from-[#1e3a8a] via-[#2563EB] to-[#3b82f6]" data-testid="hero-section">
          {/* Abstract pattern overlay */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white rounded-full blur-3xl opacity-5" />
          </div>
          
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-20 w-full">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 px-4 py-2 rounded-full text-sm mb-8">
                <Sparkles size={16} />
                Trusted by 500+ Brands & Manufacturers across India & the globe
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-6" data-testid="hero-headline">
                Buy Fabrics from India's Largest B2B Textile Platform
              </h1>
              
              <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-10 max-w-2xl mx-auto">
                Connect directly with 500+ verified seller partners. Get instant access to quality fabrics with transparent pricing, clear MOQs, and secure payments.
              </p>

              <HeroSearchCard />

              {/* Brand ticker inside the hero — on the top fold */}
              <div className="mt-10">
                <BrandTicker compact />
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap justify-center gap-8 mt-8 pt-6 border-t border-white/10">
                {trustBadges.map((badge, index) => (
                  <div key={index} className="flex items-center gap-2 text-white/80">
                    <badge.icon size={18} className="text-blue-200" />
                    <span className="text-sm font-medium">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========== WHO WE SERVE ========== */}
        <section className="py-20 lg:py-28 bg-white" data-testid="audience-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">Who Uses Locofast</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900">
                Built for Brands, Manufacturers & Sourcing Professionals
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {audiences.map((audience, index) => (
                <div key={index} className="text-center p-6">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <audience.icon size={28} className="text-[#2563EB]" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{audience.title}</h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">{audience.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== VALUE PROPOSITION ========== */}
        <section className="py-20 lg:py-28 bg-gradient-to-b from-blue-50 to-white" data-testid="value-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">Why Locofast</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900">
                The Platform Advantage
              </h2>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {valueProps.map((prop, index) => (
                <div key={index} className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition-shadow border border-blue-100">
                  <div className="w-14 h-14 bg-[#2563EB] rounded-xl flex items-center justify-center mb-6">
                    <prop.icon size={28} className="text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-neutral-900 mb-3">{prop.title}</h3>
                  <p className="text-neutral-600 leading-relaxed">{prop.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== HOW IT WORKS ========== */}
        <section className="py-20 lg:py-28 bg-white" data-testid="how-it-works-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">How It Works</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900">
                Source Fabrics in 3 Simple Steps
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div key={index} className="relative">
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-16 left-full w-full h-px bg-blue-200 -translate-x-1/2 z-0" />
                  )}
                  <div className="relative bg-white p-8 rounded-2xl border-2 border-blue-100 hover:border-[#2563EB] transition-colors">
                    <span className="text-6xl font-bold text-blue-100 absolute top-4 right-6">{step.number}</span>
                    <div className="relative">
                      <h3 className="text-xl font-semibold text-neutral-900 mb-3 pr-12">{step.title}</h3>
                      <p className="text-neutral-600 leading-relaxed mb-6">{step.description}</p>
                      <Link
                        to="/fabrics"
                        className="inline-flex items-center gap-1 text-[#2563EB] font-medium text-sm hover:gap-2 transition-all"
                      >
                        {step.cta} <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== TESTIMONIALS ========== */}
        <section className="py-20 lg:py-28 bg-[#1e3a8a]" data-testid="testimonials-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-sm tracking-widest text-blue-300 uppercase mb-4">Success Stories</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-white">
                Trusted by Brands & Manufacturers
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {testimonials.map((testimonial, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/10">
                  <p className="text-blue-100 leading-relaxed mb-6 text-sm">
                    "{testimonial.quote}"
                  </p>
                  <div>
                    <p className="font-medium text-white">{testimonial.author}</p>
                    <p className="text-blue-300 text-sm">{testimonial.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== COLLECTION SHOWCASE ========== */}
        <section className="py-20 lg:py-28 bg-white" data-testid="collections-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">Curated For You</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900">
                Explore Curated Fabric Groups
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {collections.length > 0 ? (
                collections.map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/collections/${collection.id}`}
                    className="group relative bg-gradient-to-br from-[#2563EB] to-[#1e3a8a] rounded-2xl overflow-hidden aspect-[4/5] hover:shadow-xl transition-all"
                  >
                    {collection.image ? (
                      <img src={collection.image} alt={collection.name} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity" loading="lazy" decoding="async" width={400} height={500} />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-800" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <h3 className="text-xl font-semibold text-white mb-1">{collection.name}</h3>
                      <p className="text-white/70 text-sm mb-3 line-clamp-2">{collection.description}</p>
                      <span className="inline-flex items-center gap-1 text-white text-sm font-medium group-hover:gap-2 transition-all">
                        View Options <ArrowRight size={14} />
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                [
                  { name: "Summer Weaves", img: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400" },
                  { name: "Signature Essentials", img: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400" },
                  { name: "Print Studio", img: "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=400" },
                  { name: "Premium Blends", img: "https://images.unsplash.com/photo-1606722590583-6951b5ea92ad?w=400" }
                ].map((item, index) => (
                  <Link
                    key={index}
                    to="/collections"
                    className="group relative bg-gradient-to-br from-[#2563EB] to-[#1e3a8a] rounded-2xl overflow-hidden aspect-[4/5] hover:shadow-xl transition-all"
                  >
                    <img src={item.img} alt={item.name} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity" loading="lazy" decoding="async" width={400} height={500} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <h3 className="text-xl font-semibold text-white mb-2">{item.name}</h3>
                      <span className="inline-flex items-center gap-1 text-white text-sm font-medium group-hover:gap-2 transition-all">
                        View Options <ArrowRight size={14} />
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="text-center mt-12">
              <Link
                to="/collections"
                className="inline-flex items-center gap-2 text-[#2563EB] font-medium hover:gap-3 transition-all"
              >
                View All Collections <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>

        {/* ========== ABOUT / PLATFORM BLOCK ========== */}
        <section className="py-20 lg:py-28 bg-gradient-to-b from-blue-50 to-white" data-testid="about-section">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">The Platform</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-6">
                India's Most Intelligent B2B Fabric Marketplace
              </h2>
              <div className="space-y-4 text-neutral-600 leading-relaxed text-lg">
                <p>
                  Locofast is a powerful platform that accurately connects your fabric requirements to the best-suited sellers from our verified network of 500+ textile partners across India.
                </p>
                <p>
                  Our <span className="font-semibold text-[#2563EB]">Money Safety Guarantee</span> ensures buyers have complete peace of mind — your payments are protected until you're satisfied with your order.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#2563EB]">500+</p>
                  <p className="text-neutral-600 text-sm">Seller Partners</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#2563EB]">10K+</p>
                  <p className="text-neutral-600 text-sm">Fabric Varieties</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#2563EB]">50K+</p>
                  <p className="text-neutral-600 text-sm">Orders Delivered</p>
                </div>
              </div>
              <Link
                to="/about-us"
                className="inline-flex items-center gap-2 bg-[#2563EB] text-white px-8 py-4 rounded-lg font-medium mt-10 hover:bg-blue-600 transition-colors"
              >
                Learn More About Us <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>

        {/* ========== APPLY FOR CREDIT BLOCK ========== */}
        <CreditApplicationSection />

        {/* ========== FAQ SECTION ========== */}
        <section className="py-20 lg:py-28 bg-white" data-testid="faq-section">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-sm tracking-widest text-[#2563EB] uppercase mb-4">FAQs</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900">
                Common Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="border-2 border-blue-100 rounded-xl overflow-hidden hover:border-blue-200 transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-blue-50/50 transition-colors"
                  >
                    <span className="font-medium text-neutral-900 pr-4">{faq.question}</span>
                    {openFaq === index ? (
                      <ChevronUp size={20} className="text-[#2563EB] flex-shrink-0" />
                    ) : (
                      <ChevronDown size={20} className="text-[#2563EB] flex-shrink-0" />
                    )}
                  </button>
                  {openFaq === index && (
                    <div className="px-6 pb-6 pt-0">
                      <p className="text-neutral-600 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== FINAL CTA BLOCK ========== */}
        <section className="py-20 lg:py-28 bg-gradient-to-r from-[#1e3a8a] via-[#2563EB] to-[#3b82f6]" data-testid="cta-section">
          <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white mb-6">
              Ready to Source from India's Largest Fabric Network?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join thousands of brands and manufacturers sourcing with clarity, confidence, and our Money Safety Guarantee.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/fabrics"
                className="inline-flex items-center justify-center gap-2 bg-white text-[#2563EB] px-8 py-4 rounded-lg font-medium hover:bg-blue-50 transition-colors shadow-lg"
                data-testid="final-cta-primary"
              >
                Instant Booking
                <ArrowRight size={18} />
              </Link>
              <button
                onClick={() => setShowRfqModal(true)}
                className="inline-flex items-center justify-center gap-2 bg-transparent text-white px-8 py-4 rounded-lg font-medium border-2 border-white/30 hover:bg-white/10 transition-colors"
                data-testid="final-cta-secondary"
              >
                <MessageCircle size={18} />
                Request a Quote
              </button>
            </div>
          </div>
        </section>

      </main>
      
      {/* ========== STICKY CTA BAR (Mobile) ========== */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 p-4 z-40 md:hidden" data-testid="sticky-cta">
        <Link
          to="/fabrics"
          className="flex items-center justify-center gap-2 bg-[#2563EB] text-white w-full py-3 rounded-lg font-medium"
        >
          Instant Booking
          <ArrowRight size={18} />
        </Link>
      </div>

      <RFQModal open={showRfqModal} onClose={() => setShowRfqModal(false)} />
    </>
  );
};

export default HomePage;
