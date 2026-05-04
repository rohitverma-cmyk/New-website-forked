import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight } from "lucide-react";

const CustomersPage = () => {
  const benefits = [
    "Access to fabric catalogs from multiple suppliers",
    "Technical specifications for each fabric listing",
    "Search and filter by category, type, composition, and GSM",
    "Submit enquiries directly through the platform",
    "Locofast team coordinates with suppliers on your behalf",
    "Logistics support through our supply chain network",
    "Credit facilities available for eligible customers"
  ];

  const process = [
    { step: "01", title: "Browse Catalog", desc: "View fabrics by category or use filters to find specific specifications." },
    { step: "02", title: "Submit Enquiry", desc: "Click 'Request Information' on any fabric page and provide your requirements." },
    { step: "03", title: "Receive Quotation", desc: "Our team coordinates with suppliers and provides you with pricing and terms." },
    { step: "04", title: "Place Order", desc: "Once terms are agreed, orders are placed directly with the supplier." },
  ];

  return (
    <main className="pt-20" data-testid="customers-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">For Buyers</p>
            <h1 className="text-5xl font-semibold mb-6">Customers</h1>
            <p className="text-neutral-600 text-lg leading-relaxed">
              Locofast connects fabric buyers with textile suppliers. Browse catalogs, compare specifications, and submit enquiries through a single platform.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-gap">
        <div className="container-main">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="subheading mb-4">Platform Benefits</p>
              <h2 className="text-4xl font-semibold mb-8">What the platform provides</h2>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle size={20} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
                    <span className="text-neutral-600">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="aspect-[4/3] bg-neutral-100 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800"
                alt="Fabric sourcing"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="section-gap bg-neutral-50">
        <div className="container-main">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="subheading mb-4">Process</p>
            <h2 className="text-4xl font-semibold">How it works for buyers</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {process.map((item, index) => (
              <div key={index} className="bg-white p-6 border border-neutral-100">
                <span className="text-3xl font-semibold text-neutral-300">{item.step}</span>
                <h3 className="text-lg font-medium mt-4 mb-2">{item.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#2563EB]">
        <div className="container-main text-center">
          <h2 className="text-4xl font-semibold text-white mb-6">
            Start browsing the fabric catalog
          </h2>
          <p className="text-blue-100 mb-10 max-w-xl mx-auto">
            View available fabrics and submit enquiries for your requirements.
          </p>
          <Link to="/fabrics" className="bg-white text-[#2563EB] px-10 py-4 text-sm tracking-widest uppercase font-medium hover:bg-blue-50 transition-colors inline-flex items-center gap-2" data-testid="customers-cta-btn">
            Instant Booking
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
};

export default CustomersPage;
