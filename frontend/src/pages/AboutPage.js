import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import RFQModal from "../components/RFQModal";

const AboutPage = () => {
  const [showRfqModal, setShowRfqModal] = useState(false);
  const philosophyPoints = [
    "Clarity in pricing and lead times from Day 1",
    "Structured communication between buyers and suppliers",
    "Committed suppliers who understand B2B expectations",
    "Scalable sourcing infrastructure for growing brands"
  ];

  return (
    <main className="bg-[#FAFAFA]" data-testid="about-page">
      <Helmet>
        <title>About Locofast - B2B Fabric Sourcing Platform | Our Story</title>
        <meta name="description" content="Locofast is India's leading B2B fabric sourcing platform, built by operators who understand supplier relationships and production challenges. Connecting fashion brands with verified textile mills." />
        <meta property="og:title" content="About Locofast - B2B Fabric Sourcing Platform" />
        <meta property="og:description" content="Built by operators who understand supplier relationships and production challenges. Connecting fashion brands with verified textile mills." />
        <link rel="canonical" href="https://locofast.com/about-us" />
      </Helmet>
      {/* Section 1: Hero */}
      <section className="relative h-[85vh] min-h-[600px]" data-testid="hero-section">
        <div className="absolute inset-0">
          <img
            src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/8l3peaqq_WhatsApp%20Image%202026-01-29%20at%2014.53.57%20%281%29.jpeg"
            alt="Locofast team celebration"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        </div>
        
        <div className="relative h-full max-w-7xl mx-auto px-6 lg:px-8 flex items-center">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-8" data-testid="hero-headline">
              Built by Operators.<br />
              Not Just Platform Builders.
            </h1>
            <p className="text-lg md:text-xl text-white/85 leading-relaxed max-w-xl">
              Locofast was founded by people who have spent years on the ground—understanding supplier relationships, managing production timelines, and solving real procurement challenges. We built this platform because we lived the problem first.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: More Than a Marketplace */}
      <section className="py-24 lg:py-32" data-testid="marketplace-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <div>
              <p className="text-sm tracking-widest text-neutral-500 uppercase mb-4">Our Approach</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-8">
                More Than a Marketplace
              </h2>
              <div className="space-y-6 text-neutral-600 leading-relaxed">
                <p>
                  We are not a listings platform where suppliers compete on price alone. Locofast is a structured sourcing partner—built to help brands find reliable suppliers, negotiate fair terms, and execute orders with confidence.
                </p>
                <p>
                  Every supplier on our platform is vetted. Every transaction is tracked. And every brand gets access to sourcing infrastructure that was previously only available to large enterprises.
                </p>
                <p>
                  Our team works alongside buyers to ensure clarity at every step—from initial requirement to final delivery.
                </p>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/1tpvf3i8_WhatsApp%20Image%202026-01-29%20at%2014.53.57%20%282%29.jpeg"
                alt="Locofast team outdoor activity"
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Why We Exist */}
      <section className="py-24 lg:py-32 bg-white" data-testid="philosophy-section">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <p className="text-sm tracking-widest text-neutral-500 uppercase mb-4">Our Philosophy</p>
          <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-12">
            Why We Exist
          </h2>
          
          <div className="space-y-5 mb-12">
            {philosophyPoints.map((point, index) => (
              <div key={index} className="flex items-start gap-4 text-left max-w-lg mx-auto">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-900 flex items-center justify-center mt-0.5">
                  <Check size={14} className="text-white" strokeWidth={2.5} />
                </div>
                <p className="text-neutral-700 text-lg">{point}</p>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-neutral-200">
            <p className="text-xl md:text-2xl text-neutral-900 font-medium leading-relaxed">
              "We do not promise guaranteed sales.<br />
              <span className="text-neutral-600">We promise structured sourcing."</span>
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Team Gallery */}
      <section className="py-24 lg:py-32" data-testid="team-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm tracking-widest text-neutral-500 uppercase mb-4">Our Team</p>
            <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-6">
              Built by a Young, Driven Team
            </h2>
            <p className="text-neutral-600 leading-relaxed">
              Behind Locofast is a team of operators, not just engineers. People who have managed supplier relationships, handled production delays, and understand what it takes to source fabric at scale. We built this platform because we needed it ourselves.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="aspect-square overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/8l3peaqq_WhatsApp%20Image%202026-01-29%20at%2014.53.57%20%281%29.jpeg"
                alt="Office celebration"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="aspect-square overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/jsmcl2l3_WhatsApp%20Image%202026-01-29%20at%2014.53.57.jpeg"
                alt="Team with flag"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="aspect-square overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/1tpvf3i8_WhatsApp%20Image%202026-01-29%20at%2014.53.57%20%282%29.jpeg"
                alt="Sports win"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="aspect-square overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_13644b54-5ee2-48ed-bdd9-d8ac683b189f/artifacts/10bs4awk_WhatsApp%20Image%202026-01-29%20at%2014.53.58%20%281%29.jpeg"
                alt="Team gathering"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: CTA */}
      <section className="py-24 lg:py-32 bg-white" data-testid="cta-section">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-12">
            For Brands That Want to Grow.
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setShowRfqModal(true)}
              className="px-10 py-4 bg-neutral-900 text-white text-sm tracking-wide font-medium hover:bg-neutral-800 transition-colors inline-flex items-center justify-center gap-2"
              data-testid="cta-submit-requirement"
            >
              <MessageCircle size={18} />
              Submit a Requirement
            </button>
            <Link
              to="/fabrics"
              className="px-10 py-4 border border-neutral-900 text-neutral-900 text-sm tracking-wide font-medium hover:bg-neutral-50 transition-colors"
              data-testid="cta-browse"
            >
              Browse Fabrics
            </Link>
          </div>
        </div>
      </section>

      <RFQModal open={showRfqModal} onClose={() => setShowRfqModal(false)} />
    </main>
  );
};

export default AboutPage;
