import { Link } from "react-router-dom";
import { MapPin, Users, Zap } from "lucide-react";

const CareersPage = () => {
  const values = [
    { icon: Users, title: "Collaborative", desc: "Work alongside teams across supply chain, technology, and operations." },
    { icon: Zap, title: "Fast-paced", desc: "The textile industry moves quickly. We work to match that pace." },
    { icon: MapPin, title: "Multi-location", desc: "Offices across Delhi NCR, Jaipur, Ahmedabad, and Bangladesh." },
  ];

  const departments = [
    "Supply Chain & Operations",
    "Technology & Product",
    "Sales & Business Development",
    "Finance & Credit",
    "Customer Success"
  ];

  return (
    <main className="pt-20" data-testid="careers-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">Careers</p>
            <h1 className="text-5xl font-serif font-medium mb-6">Life at Locofast</h1>
            <p className="text-neutral-600 text-lg leading-relaxed">
              Locofast is building technology for the textile supply chain. We work with suppliers, buyers, and logistics partners across India and internationally.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-gap">
        <div className="container-main">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="subheading mb-4">Work Environment</p>
            <h2 className="text-4xl font-serif font-medium">What to expect</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div key={index} className="p-8 border border-neutral-100 text-center">
                <value.icon size={32} strokeWidth={1.5} className="mx-auto text-neutral-900 mb-6" />
                <h3 className="text-lg font-serif font-medium mb-3">{value.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="section-gap bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="subheading mb-4">Teams</p>
              <h2 className="text-4xl font-serif font-medium">Departments</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {departments.map((dept, index) => (
                <div key={index} className="bg-white p-6 border border-neutral-100">
                  <p className="font-medium">{dept}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-neutral-900">
        <div className="container-main text-center">
          <h2 className="text-4xl font-serif font-medium text-white mb-6">
            Interested in working with us?
          </h2>
          <p className="text-neutral-400 mb-10 max-w-xl mx-auto">
            Send your resume and a brief introduction to our team.
          </p>
          <a 
            href="mailto:mail@locofast.com?subject=Career%20Enquiry" 
            className="bg-white text-neutral-900 px-10 py-4 text-sm tracking-widest uppercase font-medium hover:bg-neutral-100 transition-colors inline-block"
            data-testid="careers-cta-btn"
          >
            mail@locofast.com
          </a>
        </div>
      </section>
    </main>
  );
};

export default CareersPage;
