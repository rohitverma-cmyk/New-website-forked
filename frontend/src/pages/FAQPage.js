import { Link } from "react-router-dom";

const FAQPage = () => {
  const faqs = [
    {
      question: "What does Locofast do?",
      answer: "Locofast is a B2B platform that connects textile buyers with fabric suppliers. The platform provides access to fabric catalogs, specifications, and facilitates enquiries between buyers and manufacturers."
    },
    {
      question: "How do I register as a customer?",
      answer: "You can browse the fabric catalog without registration. To submit enquiries, use the contact form on any fabric page or the Contact Us page. Our team will assist you with your requirements."
    },
    {
      question: "How do I register as a supplier?",
      answer: "If you are a fabric supplier interested in listing your products, please contact our team through the Suppliers page or email mail@locofast.com with your company details."
    },
    {
      question: "Is there a registration fee?",
      answer: "No, there are no registration fees for buyers or suppliers on the platform."
    },
    {
      question: "How does the ordering process work?",
      answer: "Buyers submit enquiries through the platform. Our team coordinates with relevant suppliers to provide quotations. Once terms are agreed, orders are placed directly with suppliers. Locofast facilitates the process."
    },
    {
      question: "Does Locofast provide logistics services?",
      answer: "Yes, Locofast has a network of logistics partners to facilitate delivery coordination. Shipping options and costs are provided as part of the quotation process."
    },
    {
      question: "What is the minimum order quantity (MOQ)?",
      answer: "MOQ varies by fabric and supplier. Each fabric listing displays the specific MOQ. For sample quantities, mention your requirement in the enquiry."
    },
    {
      question: "How do I request a fabric sample?",
      answer: "Submit an enquiry on the fabric page and mention 'sample request' in your message. Include the quantity needed and delivery address. Our team will coordinate with the supplier."
    },
    {
      question: "What payment methods are accepted?",
      answer: "Payment terms are negotiated directly between buyer and supplier. Common methods include bank transfer, LC, and trade finance options for larger orders."
    },
    {
      question: "Does Locofast provide credit facilities?",
      answer: "Yes, Locofast offers a credit program for eligible customers. Contact our team for more information about credit terms and eligibility."
    }
  ];

  return (
    <main className="pt-20" data-testid="faq-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">Support</p>
            <h1 className="text-5xl font-serif font-medium mb-6">FAQs</h1>
            <p className="text-neutral-600 text-lg">
              Common questions about using the Locofast platform.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ List */}
      <section className="section-gap">
        <div className="container-main">
          <div className="max-w-3xl">
            <div className="space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-neutral-100 pb-6" data-testid={`faq-item-${index}`}>
                  <h3 className="text-lg font-medium mb-3">{faq.question}</h3>
                  <p className="text-neutral-600 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>

            {/* Contact CTA */}
            <div className="mt-12 p-8 bg-neutral-50 border border-neutral-100">
              <h3 className="text-xl font-serif font-medium mb-3">Have another question?</h3>
              <p className="text-neutral-600 mb-6">
                If you have questions not covered here, our team is available to help.
              </p>
              <Link to="/rfq" className="btn-primary inline-block" data-testid="faq-contact-btn">
                Request a Quote
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default FAQPage;
