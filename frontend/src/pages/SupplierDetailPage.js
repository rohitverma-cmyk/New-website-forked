import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import SEO, { createBreadcrumbSchema } from '../components/SEO';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { MapPin, Phone, Mail, Building2, Tag, ArrowRight, Package, ChevronRight, Factory } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SupplierDetailPage() {
  const { category, state, '*': rest } = useParams();
  // Extract slug from rest (handles "vp-tex-pvt-ltd/id=1271" → "vp-tex-pvt-ltd")
  const rawSlug = rest || '';
  const slug = rawSlug.split('/')[0];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryForm, setEnquiryForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [enquirySubmitting, setEnquirySubmitting] = useState(false);
  const [enquirySuccess, setEnquirySuccess] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API}/api/suppliers/lookup/${category}/${state}/${slug}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err) {
        console.error('Failed to fetch supplier:', err);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchData();
  }, [category, state, slug]);

  const handleEnquiry = async (e) => {
    e.preventDefault();
    setEnquirySubmitting(true);
    try {
      await fetch(`${API}/api/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enquiryForm,
          type: 'supplier_enquiry',
          source: `Supplier Page: ${category}/${state}/${slug}`,
          supplier_name: data?.seller?.company_name || data?.company_name || slug,
        })
      });
      setEnquirySuccess(true);
    } catch (err) {
      console.error('Enquiry failed:', err);
    } finally {
      setEnquirySubmitting(false);
    }
  };

  const categoryDisplay = category?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
  const stateDisplay = state?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center bg-stone-50">
          <div className="animate-pulse text-stone-400">Loading supplier information...</div>
        </div>
        <Footer />
      </>
    );
  }

  const seller = data?.seller;
  const fabrics = data?.fabrics || [];
  const relatedSuppliers = data?.related_suppliers || [];
  const meta = data?.meta || {};
  const companyName = seller?.company_name || seller?.name || data?.company_name || slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Suppliers', url: '/suppliers' },
    { name: categoryDisplay, url: `/suppliers/${category}/` },
    { name: stateDisplay, url: `/suppliers/${category}/${state}/` },
    { name: companyName, url: `/suppliers/${category}/${state}/${slug}/` },
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": companyName,
    "description": meta.description || `${categoryDisplay} fabric supplier in ${stateDisplay}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": seller?.city || '',
      "addressRegion": stateDisplay,
      "addressCountry": "IN"
    },
    "url": `https://locofast.com/suppliers/${category}/${state}/${slug}/`
  };

  return (
    <>
      <SEO
        title={meta.title?.replace(' | Locofast', '') || `${companyName} - ${categoryDisplay} Supplier in ${stateDisplay}`}
        description={meta.description}
        canonicalUrl={`/suppliers/${category}/${state}/${slug}/`}
        ogType="business.business"
        structuredData={structuredData}
      >
        <script type="application/ld+json">
          {JSON.stringify(createBreadcrumbSchema(breadcrumbs))}
        </script>
      </SEO>

      <Navbar />

      <main className="bg-stone-50 min-h-screen" data-testid="supplier-detail-page">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <nav className="flex items-center gap-1.5 text-xs text-stone-500 flex-wrap" data-testid="breadcrumb-nav">
              {breadcrumbs.map((item, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3" />}
                  {i < breadcrumbs.length - 1 ? (
                    <Link to={item.url} className="hover:text-stone-900 transition-colors">{item.name}</Link>
                  ) : (
                    <span className="text-stone-900 font-medium">{item.name}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="bg-white border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Company Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                    <Factory className="w-3 h-3" />
                    {categoryDisplay}
                  </span>
                  {data?.found && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                      Verified Supplier
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 mb-3" data-testid="supplier-name">
                  {companyName}
                </h1>
                <div className="flex items-center gap-2 text-stone-600 mb-4">
                  <MapPin className="w-4 h-4 text-stone-400" />
                  <span>{seller?.city ? `${seller.city}, ` : ''}{stateDisplay}, India</span>
                </div>
                {seller?.description && (
                  <p className="text-stone-600 leading-relaxed max-w-2xl mb-4">{seller.description}</p>
                )}
                {seller?.category_names?.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <Tag className="w-4 h-4 text-stone-400" />
                    {seller.category_names.map((cat, i) => (
                      <span key={i} className="px-2 py-0.5 bg-stone-100 text-stone-600 text-xs rounded">{cat}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setEnquiryOpen(true)}
                    className="px-6 py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 transition-colors"
                    data-testid="contact-supplier-btn"
                  >
                    Contact Supplier
                  </button>
                  <Link
                    to="/fabrics/"
                    className="px-6 py-2.5 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    Browse All Fabrics
                  </Link>
                </div>
              </div>

              {/* Stats Card */}
              <div className="w-full md:w-72 bg-stone-50 border border-stone-200 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-stone-900 text-sm uppercase tracking-wide">Supplier Snapshot</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 text-sm">Fabrics Listed</span>
                    <span className="font-semibold text-stone-900">{fabrics.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 text-sm">Category</span>
                    <span className="font-semibold text-stone-900">{categoryDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 text-sm">Region</span>
                    <span className="font-semibold text-stone-900">{stateDisplay}</span>
                  </div>
                  {seller?.seller_code && (
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500 text-sm">Supplier Code</span>
                      <span className="font-mono text-xs text-stone-700 bg-stone-200 px-2 py-0.5 rounded">{seller.seller_code}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Fabrics Section */}
        <section className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg md:text-xl font-bold text-stone-900" data-testid="fabrics-section-title">
              {data?.found
                ? `Fabrics by ${companyName}`
                : `${categoryDisplay} Fabrics from ${stateDisplay}`}
              <span className="text-stone-400 font-normal ml-2 text-base">({fabrics.length})</span>
            </h2>
          </div>

          {fabrics.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="fabrics-grid">
              {fabrics.map((fabric) => (
                <Link
                  key={fabric.id}
                  to={`/fabrics/${fabric.slug || fabric.id}`}
                  className="group bg-white border border-stone-200 rounded-lg overflow-hidden hover:shadow-md transition-all"
                  data-testid={`fabric-card-${fabric.id}`}
                >
                  <div className="aspect-square bg-stone-100 overflow-hidden">
                    {fabric.images?.[0] ? (
                      <img
                        src={fabric.images[0]}
                        alt={`${fabric.name} fabric swatch`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-300">
                        <Package className="w-10 h-10" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-stone-900 truncate group-hover:text-blue-700 transition-colors">
                      {fabric.name}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                      {fabric.composition_str || ''}{fabric.gsm ? ` | ${fabric.gsm} GSM` : ''}
                    </p>
                    {fabric.category_name && (
                      <span className="inline-block mt-2 text-xs text-blue-600">{fabric.category_name}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white border border-stone-200 rounded-xl">
              <Package className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 mb-4">No fabrics currently listed for this supplier.</p>
              <Link
                to="/fabrics/"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Browse Full Catalog <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </section>

        {/* Related Suppliers */}
        {relatedSuppliers.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 pb-10">
            <h2 className="text-lg md:text-xl font-bold text-stone-900 mb-6">
              More {categoryDisplay} Suppliers in {stateDisplay}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="related-suppliers">
              {relatedSuppliers.map((s, i) => {
                const sSlug = (s.company_name || s.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const sState = (s.state || state || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                return (
                  <Link
                    key={i}
                    to={`/suppliers/${category}/${sState}/${sSlug}/`}
                    className="flex items-center gap-4 p-4 bg-white border border-stone-200 rounded-lg hover:shadow-sm transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-stone-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-stone-900 truncate group-hover:text-blue-700 transition-colors">
                        {s.company_name || s.name}
                      </h3>
                      {(s.city || s.state) && (
                        <p className="text-xs text-stone-500">{s.city}{s.city && s.state ? ', ' : ''}{s.state}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-300 ml-auto flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="bg-stone-900 text-white">
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <h2 className="text-xl md:text-2xl font-bold mb-3">
              Looking for {categoryDisplay} Fabrics from {stateDisplay}?
            </h2>
            <p className="text-stone-400 mb-6 text-sm md:text-base">
              Get samples, pricing, and bulk availability from verified Indian mills.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                to="/fabrics/"
                className="px-6 py-2.5 bg-white text-stone-900 text-sm font-medium rounded-lg hover:bg-stone-100 transition-colors"
              >
                Browse Fabric Catalog
              </Link>
              <button
                onClick={() => setEnquiryOpen(true)}
                className="px-6 py-2.5 border border-stone-500 text-white text-sm font-medium rounded-lg hover:bg-stone-800 transition-colors"
                data-testid="cta-enquiry-btn"
              >
                Send Enquiry
              </button>
            </div>
          </div>
        </section>

        {/* Enquiry Modal */}
        {enquiryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="enquiry-modal">
            <div className="bg-white rounded-xl max-w-md w-full p-6 relative">
              <button
                onClick={() => { setEnquiryOpen(false); setEnquirySuccess(false); }}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-600"
              >
                &times;
              </button>
              {enquirySuccess ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="font-semibold text-stone-900 mb-2">Enquiry Sent!</h3>
                  <p className="text-stone-500 text-sm">Our team will get back to you within 24 hours.</p>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-stone-900 mb-1">Contact {companyName}</h3>
                  <p className="text-sm text-stone-500 mb-4">Get pricing, samples, and availability details.</p>
                  <form onSubmit={handleEnquiry} className="space-y-3">
                    <input
                      type="text" required placeholder="Your Name"
                      value={enquiryForm.name}
                      onChange={(e) => setEnquiryForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none"
                      data-testid="enquiry-name"
                    />
                    <input
                      type="email" required placeholder="Email Address"
                      value={enquiryForm.email}
                      onChange={(e) => setEnquiryForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none"
                      data-testid="enquiry-email"
                    />
                    <input
                      type="tel" required placeholder="Phone Number"
                      value={enquiryForm.phone}
                      onChange={(e) => setEnquiryForm(p => ({ ...p, phone: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none"
                      data-testid="enquiry-phone"
                    />
                    <textarea
                      placeholder="What are you looking for? (optional)"
                      rows={3}
                      value={enquiryForm.message}
                      onChange={(e) => setEnquiryForm(p => ({ ...p, message: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none resize-none"
                      data-testid="enquiry-message"
                    />
                    <button
                      type="submit"
                      disabled={enquirySubmitting}
                      className="w-full py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
                      data-testid="enquiry-submit"
                    >
                      {enquirySubmitting ? 'Sending...' : 'Send Enquiry'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
