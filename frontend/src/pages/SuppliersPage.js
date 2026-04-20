import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight } from "lucide-react";

const SuppliersPage = () => {
  const benefits = [
    "List your fabrics on the platform at no cost",
    "Reach buyers across India and internationally",
    "Receive enquiries from verified buyers",
    "Locofast handles buyer coordination",
    "Logistics support available through our network",
    "Advance payment options for orders",
    "No commission on direct supplier-buyer transactions"
  ];

  const requirements = [
    { title: "Production Capacity", desc: "Minimum production capacity documentation" },
    { title: "Quality Standards", desc: "Quality control processes and certifications (if applicable)" },
    { title: "Product Range", desc: "Information about fabric types and specifications you supply" },
    { title: "Business Registration", desc: "Valid business registration documents" },
  ];

  return (
    <main className="pt-20" data-testid="suppliers-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">For Sellers</p>
            <h1 className="text-5xl font-semibold mb-6">Suppliers</h1>
            <p className="text-neutral-600 text-lg leading-relaxed">
              Locofast connects textile suppliers with fabric buyers. List your products on the platform and receive enquiries from verified customers.
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
                src="https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=800"
                alt="Textile manufacturing"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="section-gap bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <p className="subheading mb-4">Onboarding</p>
              <h2 className="text-4xl font-semibold">Supplier requirements</h2>
            </div>
            <div className="space-y-6">
              {requirements.map((req, index) => (
                <div key={index} className="bg-white p-6 border border-neutral-100">
                  <h3 className="text-lg font-medium mb-2">{req.title}</h3>
                  <p className="text-neutral-500">{req.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#2563EB]">
        <div className="container-main text-center">
          <h2 className="text-4xl font-semibold text-white mb-6">
            Interested in becoming a supplier?
          </h2>
          <p className="text-blue-100 mb-10 max-w-xl mx-auto">
            Contact our team with your company details and product information.
          </p>
          <Link to="/contact" className="bg-white text-[#2563EB] px-10 py-4 text-sm tracking-widest uppercase font-medium hover:bg-blue-50 transition-colors inline-flex items-center gap-2" data-testid="suppliers-cta-btn">
            Contact Us
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
};

export default SuppliersPage;
