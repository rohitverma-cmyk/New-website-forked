import { Link } from "react-router-dom";
import { Search, FileText, MessageSquare, Truck, ArrowLeft } from "lucide-react";

const HowItWorksPage = () => {
  const steps = [
    {
      icon: Search,
      number: "01",
      title: "Browse the Catalog",
      description: "View fabric listings by category or use filters for fabric type, composition, and GSM range. Each listing displays technical specifications provided by the supplier.",
    },
    {
      icon: FileText,
      number: "02",
      title: "Review Specifications",
      description: "Each fabric page includes: composition, GSM, width, finish, color, MOQ, price range (where available), and availability status. Images show fabric swatches.",
    },
    {
      icon: MessageSquare,
      number: "03",
      title: "Submit an Enquiry",
      description: "Click 'Request Information' to submit an enquiry. Provide your contact details and requirements. Our team will connect you with the supplier.",
    },
    {
      icon: Truck,
      number: "04",
      title: "Coordinate with Supplier",
      description: "Locofast facilitates communication between buyer and supplier. This includes pricing discussions, sample requests, and delivery coordination.",
    },
  ];

  const faqs = [
    {
      q: "What is the minimum order quantity?",
      a: "MOQ varies by fabric and supplier. Each listing displays the specific MOQ. For sample quantities, submit an enquiry specifying your requirement.",
    },
    {
      q: "How do I request a sample?",
      a: "Submit an enquiry through the fabric page and mention 'sample request' in your message. Provide the quantity needed and delivery address.",
    },
    {
      q: "How are suppliers verified?",
      a: "Suppliers are assessed before being added to the platform. This includes production capacity review and quality documentation. Verification details vary by supplier.",
    },
    {
      q: "What are the payment terms?",
      a: "Payment terms are negotiated directly between buyer and supplier. Common terms include advance payment, LC, and credit (subject to supplier approval).",
    },
    {
      q: "Does Locofast handle logistics?",
      a: "Locofast can coordinate logistics through our network. Shipping costs and timelines are provided as part of the quotation process.",
    },
  ];

  return (
    <main className="pt-20" data-testid="how-it-works-page">
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-neutral-50">
        <div className="container-main">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <div className="max-w-3xl">
            <p className="subheading mb-4">Process</p>
            <h1 className="text-5xl md:text-6xl font-semibold leading-tight mb-6">
              How the Platform Works
            </h1>
            <p className="text-lg text-neutral-600 leading-relaxed">
              Locofast connects fabric buyers with suppliers. Here is how the process works from browsing to order placement.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="section-gap" data-testid="steps-section">
        <div className="container-main">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-[#2563EB] text-white flex items-center justify-center">
                    <step.icon size={28} strokeWidth={1.5} />
                  </div>
                </div>
                <div>
                  <span className="subheading text-blue-100">Step {step.number}</span>
                  <h3 className="text-2xl font-semibold mt-1 mb-3">{step.title}</h3>
                  <p className="text-neutral-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Locofast Provides */}
      <section className="section-gap bg-neutral-50">
        <div className="container-main">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <p className="subheading mb-4">Platform Services</p>
              <h2 className="text-4xl font-semibold mb-6">
                What Locofast provides
              </h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-[#2563EB] text-white text-sm flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <span className="text-neutral-600">Fabric catalog with technical specifications from multiple suppliers</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-[#2563EB] text-white text-sm flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <span className="text-neutral-600">Search and filter tools for finding specific fabric types</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-[#2563EB] text-white text-sm flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <span className="text-neutral-600">Enquiry submission and supplier coordination</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-[#2563EB] text-white text-sm flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <span className="text-neutral-600">Logistics support through our supply chain network</span>
                </li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 aspect-square bg-neutral-200 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1560258632-fb994fd2bd44?w=800"
                alt="Fabric texture"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-gap" data-testid="faq-section">
        <div className="container-main">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <p className="subheading mb-4">FAQ</p>
              <h2 className="text-4xl font-semibold">Common Questions</h2>
            </div>

            <div className="space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-neutral-100 pb-6">
                  <h3 className="text-lg font-medium mb-3">{faq.q}</h3>
                  <p className="text-neutral-600 leading-relaxed">{faq.a}</p>
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
            View the fabric catalog
          </h2>
          <p className="text-blue-100 mb-10 max-w-xl mx-auto">
            Instant Booking by category, review specifications, and submit enquiries.
          </p>
          <Link to="/fabrics" className="bg-white text-[#2563EB] px-10 py-4 text-sm tracking-widest uppercase font-medium hover:bg-blue-50 transition-colors inline-block" data-testid="how-cta-btn">
            Instant Booking
          </Link>
        </div>
      </section>
    </main>
  );
};

export default HowItWorksPage;
