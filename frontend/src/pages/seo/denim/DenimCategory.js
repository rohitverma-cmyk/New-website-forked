import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';

const DenimCategory = () => {
  const subpages = [
    { name: '8 Oz Denim Fabric', url: '/fabrics/denim/8-oz/', desc: 'Lightweight denim for shirts and summer wear' },
    { name: '10 Oz Denim Fabric', url: '/fabrics/denim/10-oz/', desc: 'Versatile mid-weight denim for jeans and jackets' },
    { name: '12 Oz Denim Fabric', url: '/fabrics/denim/12-oz/', desc: 'Heavy-weight denim for workwear and premium jeans' },
    { name: 'Stretch Denim', url: '/fabrics/denim/stretch/', desc: 'Comfort stretch denim with elastane blend' },
    { name: 'Rigid Denim', url: '/fabrics/denim/rigid/', desc: '100% cotton non-stretch traditional denim' },
    { name: 'Indigo Dyed Denim', url: '/fabrics/denim/indigo-dyed/', desc: 'Classic rope-dyed indigo denim fabrics' },
    { name: 'Denim for Jeans Manufacturers', url: '/fabrics/denim/for-jeans-manufacturers/', desc: 'Production-ready denim for jeans factories' },
    { name: 'Bulk Denim Suppliers India', url: '/fabrics/denim/bulk-suppliers-india/', desc: 'High-volume denim sourcing from Indian mills' },
    { name: 'Denim Manufacturers in India', url: '/fabrics/denim/denim-fabric-manufacturers-in-india/', desc: 'Connect with leading denim mills in India' },
  ];

  return (
    <>
      <Navbar />
      <main className="pt-20 bg-white" data-testid="denim-category">
        {/* Breadcrumb */}
        <div className="bg-slate-50 border-b border-slate-200">
          <div className="container-main py-3">
            <nav className="flex items-center gap-2 text-sm text-slate-600">
              <Link to="/" className="hover:text-blue-600">Home</Link>
              <span className="text-slate-400">/</span>
              <Link to="/fabrics/" className="hover:text-blue-600">Fabrics</Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-900">Denim Fabrics</span>
            </nav>
          </div>
        </div>

        {/* Hero */}
        <section className="py-12 lg:py-16 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="container-main">
            <div className="max-w-4xl">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                Denim Fabric Manufacturers & Suppliers in India
              </h1>
              <p className="text-lg text-slate-300 mb-8 leading-relaxed">
                Source premium denim fabrics directly from India's leading mills. From lightweight 6 oz shirting denim to heavy 14 oz workwear grades, we connect you with verified manufacturers offering transparent pricing, consistent quality, and reliable bulk supply for your production needs.
              </p>
              <Link
                to="/assisted-sourcing"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Raise Your Requirement
                <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        </section>

        {/* Specs Overview */}
        <section className="py-12 bg-white border-b border-slate-200">
          <div className="container-main">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Denim Fabric Specifications</h2>
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200 w-1/3">Weight Range</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">6 oz to 14 oz (170 GSM to 475 GSM)</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Composition</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">100% Cotton, Cotton-Polyester, Cotton-Lycra blends</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Construction</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">3/1 Twill, 2/1 Twill, Broken Twill, Satin Weave</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Width</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">54" to 62" (137 cm to 157 cm)</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Stretch Options</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">Rigid (0%), Comfort Stretch (1-3%), Power Stretch (5%+)</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">MOQ Range</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">1,000 meters to 5,000 meters (varies by mill)</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Lead Time</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">15-30 days for stock, 45-60 days for production</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Finish Options</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">Raw, Stone Wash, Enzyme Wash, Bleached, Coated</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-12">
          <div className="container-main">
            <div className="max-w-4xl prose prose-slate">
              <h2>Sourcing Denim Fabric for Bulk Production</h2>
              <p>
                India is home to some of the world's most advanced denim manufacturing facilities, producing over 1.5 billion meters of denim annually. Whether you're a jeans manufacturer, fashion brand, or buying house, sourcing the right denim fabric requires understanding mill capabilities, quality grades, and production timelines.
              </p>
              <p>
                Our network includes mills in Gujarat, Tamil Nadu, and Maharashtra—India's primary denim manufacturing hubs. These facilities offer everything from basic indigo denim to specialty constructions including crosshatch, slub, and sustainable options like organic cotton and recycled fiber blends.
              </p>

              <h3>Denim Weight Guide for Buyers</h3>
              <p>
                Choosing the right denim weight depends on your end product. Lightweight 6-8 oz denim suits shirts and summer garments. Mid-weight 9-11 oz works best for everyday jeans and casual wear. Heavy 12-14 oz denim is ideal for workwear, selvedge products, and premium fashion jeans that require substantial drape and durability.
              </p>

              <h3>Quality Parameters We Verify</h3>
              <p>
                Before connecting you with mills, we verify key quality parameters: GSM consistency across rolls, shrinkage tolerance, color fastness ratings, and tensile strength. Mills in our network maintain ISO certifications and follow international testing standards including AATCC and ASTM protocols.
              </p>
            </div>
          </div>
        </section>

        {/* Subpages Grid */}
        <section className="py-12 bg-slate-50">
          <div className="container-main">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">Browse Denim by Specification</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {subpages.map((page, index) => (
                <Link
                  key={index}
                  to={page.url}
                  className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all group"
                >
                  <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-blue-600">{page.name}</h3>
                  <p className="text-sm text-slate-600 mb-4">{page.desc}</p>
                  <span className="text-blue-600 text-sm font-medium flex items-center gap-1">
                    View Details <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-12 bg-white">
          <div className="container-main">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Common Applications</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  'Men\'s and women\'s jeans manufacturing',
                  'Denim jackets and outerwear',
                  'Casual shirts and chambray products',
                  'Workwear and industrial uniforms',
                  'Fashion dresses and skirts',
                  'Denim accessories and bags'
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-3 bg-slate-50 p-4 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-12 bg-slate-50">
          <div className="container-main">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Pricing Insight</h2>
              <p className="text-slate-600 leading-relaxed">
                Denim fabric pricing varies based on weight, composition, construction, and finish type. Bulk pricing depends on order volume, with better rates typically available for orders above 5,000 meters. Additional factors include dye method (rope-dyed vs. slasher-dyed), special treatments, and current cotton market rates. Request quotes from multiple mills through our platform to compare pricing and terms.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-blue-600">
          <div className="container-main text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Source Denim Fabric Today</h2>
            <p className="text-blue-100 mb-8 max-w-xl mx-auto">
              Share your denim requirements and get responses from verified Indian mills within 48 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/fabrics?category=cat-denim"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Browse Denim Fabrics
                <ArrowRight size={20} />
              </Link>
              <Link
                to="/assisted-sourcing"
                className="inline-flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Raise Your Requirement
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default DenimCategory;
