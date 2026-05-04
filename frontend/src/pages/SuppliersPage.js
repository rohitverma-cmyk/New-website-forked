import { Link } from "react-router-dom";
import { ArrowRight, PhoneOff, TrendingUp, ShieldCheck, Globe2, UserCheck } from "lucide-react";

// Five-pillar value prop for sellers, sourced directly from the user's brief.
// We deliberately use icon-led cards (not a long bullet list) so each promise
// reads as a distinct lever — not just feature copy. The icons (PhoneOff,
// TrendingUp, ShieldCheck, Globe2, UserCheck) match the benefit verbatim
// for instant scannability.
const sellerPillars = [
  {
    icon: PhoneOff,
    title: "Zero cold-calling for you",
    desc:
      "We never ask sellers to chase buyers. Demand comes pre-qualified to you through Locofast — so your team focuses on production, not sales calls.",
  },
  {
    icon: TrendingUp,
    title: "Better mill utilisation",
    desc:
      "We aggregate buyer demand and route it to your idle capacity. List your inventory once and we work to convert it into orders, lifting your monthly utilisation.",
  },
  {
    icon: ShieldCheck,
    title: "Money-back guarantee",
    desc:
      "Locofast's secure escrow & payment-protection layer ensures the money for every confirmed order is locked in before dispatch — no chasing, no defaults.",
  },
  {
    icon: Globe2,
    title: "Direct access to export markets",
    desc:
      "Plug into our buyer network across India, Bangladesh, the EU and the Middle East. We handle compliance, logistics and FX — you just ship.",
  },
  {
    icon: UserCheck,
    title: "A dedicated supplier manager",
    desc:
      "Every onboarded mill gets a single point of contact — for inventory uploads, pricing tweaks, dispatch queries and growth planning. No call-centre runaround.",
  },
];

const requirements = [
  { title: "Production Capacity", desc: "Minimum monthly capacity documentation so we can match you to demand of the right scale." },
  { title: "Quality Standards", desc: "Quality control processes and certifications (GOTS, OEKO-TEX, ISO etc. — wherever applicable)." },
  { title: "Product Range", desc: "Fabric types, weaves, GSM range, widths and any speciality finishes you supply." },
  { title: "Business Registration", desc: "Valid GST + business registration documents for KYC and payment routing." },
];

const SuppliersPage = () => (
  <main className="pt-20" data-testid="suppliers-page">
    {/* Header */}
    <section className="py-16 lg:py-24 bg-neutral-50">
      <div className="container-main">
        <div className="max-w-3xl">
          <p className="subheading mb-4">For Sellers</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6">
            Sell more, chase less.
          </h1>
          <p className="text-neutral-600 text-lg leading-relaxed">
            Locofast brings demand to your mill. No cold calls, no buyer coordination,
            no payment risk — just better utilisation of the looms you already run.
          </p>
        </div>
      </div>
    </section>

    {/* Five Pillars */}
    <section className="section-gap">
      <div className="container-main">
        <div className="max-w-3xl mb-12">
          <p className="subheading mb-3">Why sellers partner with Locofast</p>
          <h2 className="text-3xl sm:text-4xl font-semibold">
            Five things you get from day one
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="seller-pillars">
          {sellerPillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="bg-white border border-neutral-200 rounded-xl p-6 hover:border-[#2563EB] hover:shadow-sm transition-all"
                data-testid={`seller-pillar-${idx}`}
              >
                <div className="w-11 h-11 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{p.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>

    {/* Requirements */}
    <section className="section-gap bg-neutral-50">
      <div className="container-main">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="subheading mb-4">Onboarding</p>
            <h2 className="text-3xl sm:text-4xl font-semibold">What we'll need from you</h2>
            <p className="text-neutral-600 mt-3 text-base">
              Quick KYC, then your dedicated manager takes it from there.
            </p>
          </div>
          <div className="space-y-4" data-testid="seller-requirements">
            {requirements.map((req, index) => (
              <div key={index} className="bg-white p-6 border border-neutral-200 rounded-lg">
                <h3 className="text-lg font-medium mb-1">{req.title}</h3>
                <p className="text-neutral-600">{req.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-24 bg-[#2563EB]">
      <div className="container-main text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-6">
          Ready to sell more without selling?
        </h2>
        <p className="text-blue-100 mb-10 max-w-xl mx-auto">
          Tell us a bit about your mill — we'll route relevant demand and assign your
          supplier manager within 48 hours.
        </p>
        <Link
          to="/contact"
          className="bg-white text-[#2563EB] px-10 py-4 text-sm tracking-widest uppercase font-medium hover:bg-blue-50 transition-colors inline-flex items-center gap-2"
          data-testid="suppliers-cta-btn"
        >
          Become a Seller
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  </main>
);

export default SuppliersPage;
