import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Phone, Mail } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

const SEOPageLayout = ({ 
  title, 
  metaDescription,
  breadcrumbs,
  intro,
  specs,
  useCases,
  pricingNote,
  relatedLinks,
  categoryLink,
  children 
}) => {
  return (
    <>
      <Navbar />
      <main className="pt-20 bg-white" data-testid="seo-page">
        {/* Breadcrumbs */}
        <div className="bg-slate-50 border-b border-slate-200">
          <div className="container-main py-3">
            <nav className="flex items-center gap-2 text-sm text-slate-600">
              <Link to="/" className="hover:text-blue-600">Home</Link>
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  <span className="text-slate-400">/</span>
                  {crumb.link ? (
                    <Link to={crumb.link} className="hover:text-blue-600">{crumb.label}</Link>
                  ) : (
                    <span className="text-slate-900">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="py-12 lg:py-16 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="container-main">
            <div className="max-w-4xl">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                {title}
              </h1>
              <p className="text-lg text-slate-300 leading-relaxed mb-8">
                {intro}
              </p>
              <Link
                to="/assisted-sourcing"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                data-testid="hero-cta"
              >
                Raise Your Requirement
                <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        </section>

        {/* Technical Specifications */}
        {specs && (
          <section className="py-12 bg-white border-b border-slate-200">
            <div className="container-main">
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Technical Specifications</h2>
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <tbody>
                      {specs.map((spec, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200 w-1/3">
                            {spec.label}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">
                            {spec.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Main Content */}
        <section className="py-12">
          <div className="container-main">
            <div className="max-w-4xl">
              {children}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        {useCases && useCases.length > 0 && (
          <section className="py-12 bg-slate-50">
            <div className="container-main">
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Common Use Cases</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {useCases.map((useCase, index) => (
                    <div key={index} className="flex items-start gap-3 bg-white p-4 rounded-lg border border-slate-200">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700">{useCase}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Pricing Insight */}
        {pricingNote && (
          <section className="py-12 bg-white border-b border-slate-200">
            <div className="container-main">
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Pricing Insight</h2>
                <p className="text-slate-600 leading-relaxed">
                  {pricingNote}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* How It Works */}
        <section className="py-12 bg-slate-50">
          <div className="container-main">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-8">How It Works</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { step: '1', title: 'Share Requirement', desc: 'Tell us what fabric you need, quantity, and timeline' },
                  { step: '2', title: 'Compare Responses', desc: 'Review quotes from verified mills with full specifications' },
                  { step: '3', title: 'Confirm Order', desc: 'Finalize terms, sampling, and production schedule' },
                  { step: '4', title: 'Logistics & Payment', desc: 'We coordinate dispatch and secure payment processing' }
                ].map((item, index) => (
                  <div key={index} className="text-center">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                      {item.step}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Why Locofast */}
        <section className="py-12 bg-white">
          <div className="container-main">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-8">Why Source Through Locofast</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  { title: 'Category Focus', desc: 'Deep expertise in denim and knit fabrics with curated mill network' },
                  { title: 'Direct Mill Communication', desc: 'Connect directly with manufacturers, no middlemen markup' },
                  { title: 'Transparent Comparison', desc: 'Compare specs, pricing, and lead times across multiple suppliers' },
                  { title: 'Logistics Support', desc: 'End-to-end dispatch coordination and shipment tracking' },
                  { title: 'Payment Safety', desc: 'Secure payment terms with milestone-based releases' },
                  { title: 'Quality Assurance', desc: 'Pre-shipment inspection and quality verification support' }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                      <p className="text-sm text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Related Links */}
        {relatedLinks && relatedLinks.length > 0 && (
          <section className="py-12 bg-slate-50 border-t border-slate-200">
            <div className="container-main">
              <div className="max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Explore Related Fabrics</h2>
                <div className="flex flex-wrap gap-3">
                  {relatedLinks.map((link, index) => (
                    <Link
                      key={index}
                      to={link.url}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-blue-500 hover:text-blue-600 transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  ))}
                  {categoryLink && (
                    <Link
                      to={categoryLink.url}
                      className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
                    >
                      {categoryLink.label}
                    </Link>
                  )}
                  <Link
                    to="/fabrics/"
                    className="px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-200 transition-colors text-sm"
                  >
                    All Fabric Categories
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-16 bg-blue-600">
          <div className="container-main">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Ready to Source Your Fabric?
              </h2>
              <p className="text-blue-100 mb-8">
                Share your requirements and get responses from verified mills within 48 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/assisted-sourcing"
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                  data-testid="bottom-cta"
                >
                  Raise Your Requirement
                  <ArrowRight size={20} />
                </Link>
                <a
                  href="https://wa.me/918920392418"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  <Phone size={20} />
                  Talk to Expert
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default SEOPageLayout;
