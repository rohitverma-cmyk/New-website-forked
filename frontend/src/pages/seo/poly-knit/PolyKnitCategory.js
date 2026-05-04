import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';

const PolyKnitCategory = () => {
  const subpages = [
    { name: '180 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/180-gsm/', desc: 'Lightweight performance fabric for activewear' },
    { name: '220 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/220-gsm/', desc: 'Mid-weight knit for sports and casual wear' },
    { name: '240 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/240-gsm/', desc: 'Heavy-weight knit for winter and outerwear' },
    { name: 'Interlock Poly Knit', url: '/fabrics/poly-knit-fabrics/interlock/', desc: 'Double-knit fabric with smooth both sides' },
    { name: 'Jersey Poly Knit', url: '/fabrics/poly-knit-fabrics/jersey/', desc: 'Single-knit fabric for t-shirts and basics' },
    { name: 'Moisture Wicking', url: '/fabrics/poly-knit-fabrics/moisture-wicking/', desc: 'Performance fabrics with sweat management' },
    { name: 'Sportswear Fabrics', url: '/fabrics/poly-knit-fabrics/for-sportswear/', desc: 'Technical fabrics for athletic apparel' },
    { name: 'Bulk Suppliers India', url: '/fabrics/poly-knit-fabrics/bulk-suppliers-india/', desc: 'High-volume poly knit sourcing' },
    { name: 'Manufacturers in India', url: '/fabrics/poly-knit-fabrics/polyester-knit-fabric-manufacturers-in-india/', desc: 'Connect with leading poly knit mills' },
  ];

  return (
    <>
      <Navbar />
      <main className="pt-20 bg-white" data-testid="poly-knit-category">
        {/* Breadcrumb */}
        <div className="bg-slate-50 border-b border-slate-200">
          <div className="container-main py-3">
            <nav className="flex items-center gap-2 text-sm text-slate-600">
              <Link to="/" className="hover:text-blue-600">Home</Link>
              <span className="text-slate-400">/</span>
              <Link to="/fabrics/" className="hover:text-blue-600">Fabrics</Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-900">Poly Knit Fabrics</span>
            </nav>
          </div>
        </div>

        {/* Hero */}
        <section className="py-12 lg:py-16 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="container-main">
            <div className="max-w-4xl">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                Polyester Knit Fabric Manufacturers & Suppliers in India
              </h1>
              <p className="text-lg text-slate-300 mb-8 leading-relaxed">
                Source high-performance polyester knit fabrics from India's leading technical textile mills. From lightweight moisture-wicking jerseys to heavy interlock constructions, our verified suppliers offer consistent quality, competitive bulk pricing, and reliable delivery for sportswear, activewear, and athleisure manufacturing.
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
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Poly Knit Fabric Specifications</h2>
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200 w-1/3">GSM Range</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">140 GSM to 280 GSM</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Composition</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">100% Polyester, Poly-Spandex blends, Poly-Cotton blends</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Construction</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">Single Jersey, Interlock, Pique, Mesh, Rib</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Width</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">58" to 72" (open width and tubular)</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Performance Features</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">Moisture Wicking, Quick Dry, UV Protection, Anti-microbial</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">MOQ Range</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">500 kg to 2,000 kg (varies by mill)</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Lead Time</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">10-15 days (stock), 25-35 days (production)</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-b border-slate-200">Finish Options</td>
                      <td className="px-6 py-4 text-sm text-slate-900 border-b border-slate-200">Peached, Brushed, Moisture Management, DWR coating</td>
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
              <h2>Performance Fabrics for Modern Apparel</h2>
              <p>
                Polyester knit fabrics have become essential materials for sportswear, activewear, and performance apparel categories. The ability to engineer specific properties—moisture management, stretch, breathability, and durability—makes poly knits the fabric of choice for athletic and lifestyle brands worldwide.
              </p>
              <p>
                Indian mills have developed strong capabilities in technical knit production, offering a wide range of constructions and performance finishes. From basic single jersey to advanced moisture-wicking interlock, our verified suppliers provide consistent quality for bulk manufacturing requirements.
              </p>

              <h3>Key Performance Properties</h3>
              <p>
                Modern poly knit fabrics offer multiple performance benefits: moisture-wicking moves sweat away from the body; quick-dry properties ensure comfort during activity; four-way stretch provides unrestricted movement; and anti-microbial treatments control odor. Mills can combine these properties to meet specific end-use requirements.
              </p>

              <h3>Sustainable Options</h3>
              <p>
                Many Indian knit mills now offer recycled polyester options, using post-consumer PET bottles as raw material. GRS (Global Recycled Standard) certified fabrics are increasingly available for brands with sustainability commitments. Discuss your sustainability requirements with suppliers to explore available options.
              </p>
            </div>
          </div>
        </section>

        {/* Subpages Grid */}
        <section className="py-12 bg-slate-50">
          <div className="container-main">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">Browse Poly Knit by Specification</h2>
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
                  'Athletic wear and sports uniforms',
                  'Gym and fitness apparel',
                  'Running and cycling gear',
                  'Yoga and activewear',
                  'Casual athleisure collections',
                  'Corporate sportswear and team uniforms'
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

        {/* CTA */}
        <section className="py-16 bg-blue-600">
          <div className="container-main text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Source Poly Knit Fabric Today</h2>
            <p className="text-blue-100 mb-8 max-w-xl mx-auto">
              Share your poly knit requirements and get responses from verified Indian mills within 48 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/fabrics?category=cat-knits"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Browse Poly Knit Fabrics
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

export default PolyKnitCategory;
