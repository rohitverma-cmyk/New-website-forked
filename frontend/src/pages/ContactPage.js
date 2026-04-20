import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin, Mail, Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createEnquiry } from "../lib/api";

const ContactPage = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      await createEnquiry({
        ...form,
        source: "contact_page",
        enquiry_type: "general"
      });
      toast.success("Message submitted. Our team will respond within 24 hours.");
      setForm({ name: "", email: "", phone: "", company: "", message: "" });
    } catch (err) {
      toast.error("Failed to submit. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <>
      <Helmet>
        <title>Contact Locofast - Get in Touch for Fabric Sourcing | B2B Inquiries</title>
        <meta name="description" content="Contact Locofast for B2B fabric sourcing inquiries. Get matched with verified textile suppliers within 48 hours. Offices in Delhi, Noida, Gurugram, Jaipur, Ahmedabad." />
        <meta property="og:title" content="Contact Locofast - Get in Touch for Fabric Sourcing" />
        <meta property="og:description" content="Contact Locofast for B2B fabric sourcing inquiries. Get matched with verified textile suppliers within 48 hours." />
        <link rel="canonical" href="https://locofast.com/contact" />
      </Helmet>
    <main className="pt-20" data-testid="contact-page">
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-neutral-50">
        <div className="container-main">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <div className="max-w-3xl">
            <p className="subheading mb-4">Contact</p>
            <h1 className="text-5xl md:text-6xl font-serif font-medium leading-tight mb-6">
              Get in Touch
            </h1>
            <p className="text-lg text-neutral-600 leading-relaxed">
              Submit your enquiry or question. Our team will respond within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="section-gap">
        <div className="container-main">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            {/* Form */}
            <div data-testid="contact-form-section">
              <h2 className="text-2xl font-serif font-medium mb-8">Submit Enquiry</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-3 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:outline-none"
                      required
                      data-testid="contact-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-3 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:outline-none"
                      required
                      data-testid="contact-email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-4 py-3 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:outline-none"
                      data-testid="contact-phone"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Company</label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className="w-full px-4 py-3 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:outline-none"
                      data-testid="contact-company"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Message *</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-sm focus:border-neutral-900 focus:outline-none h-40 resize-none"
                    placeholder="Describe your requirement or question."
                    required
                    data-testid="contact-message"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary disabled:opacity-50"
                  data-testid="contact-submit-btn"
                >
                  {submitting ? "Submitting..." : "Submit Enquiry"}
                </button>
              </form>
            </div>

            {/* Contact Info */}
            <div data-testid="contact-info-section">
              <h2 className="text-2xl font-serif font-medium mb-8">Contact Information</h2>
              
              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <Mail size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Email</h3>
                    <p className="text-neutral-600">mail@locofast.com</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <Phone size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Phone</h3>
                    <p className="text-neutral-600">+91 8920 392 418</p>
                    <p className="text-neutral-500 text-sm">Mon - Sat, 9am - 6pm IST</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <MapPin size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Headquarters</h3>
                    <p className="text-neutral-600">
                      Desk Connect, First Floor<br />
                      Plot No-2, Kh.No. 384/2<br />
                      Mehrauli-Gurgaon Road<br />
                      Ghitorni, New Delhi 110030
                    </p>
                  </div>
                </div>
              </div>

              {/* Other Offices */}
              <div className="mt-12 pt-8 border-t border-neutral-100">
                <h3 className="font-medium mb-4">Other Offices</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-neutral-600">
                  <div>
                    <p className="font-medium text-neutral-900">Noida</p>
                    <p>Sector-2, Uttar Pradesh</p>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Gurugram</p>
                    <p>Udyog Vihar, Sector 18</p>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Jaipur</p>
                    <p>Mansarovar Sector 3</p>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Ahmedabad</p>
                    <p>Chimanlal Girdharlal Road</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    </>
  );
};

export default ContactPage;
