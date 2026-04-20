import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

const FabricsHub = () => {
  const categories = [
    {
      name: 'Denim Fabrics',
      slug: '/fabrics/denim/',
      catalogUrl: '/fabrics?category=cat-denim',
      infoUrl: '/fabrics/denim/',
      description: 'Premium denim from Indian mills. Available in multiple weights from 6 oz to 14 oz, with stretch and rigid options.',
      image: 'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=600&h=400&fit=crop',
      specs: ['6-14 oz weights', 'Stretch & Rigid', 'Indigo & Black', 'Raw & Washed'],
      subpages: [
        { name: '8 Oz Denim', url: '/fabrics/denim/8-oz/' },
        { name: '10 Oz Denim', url: '/fabrics/denim/10-oz/' },
        { name: '12 Oz Denim', url: '/fabrics/denim/12-oz/' },
        { name: 'Stretch Denim', url: '/fabrics/denim/stretch/' },
        { name: 'Rigid Denim', url: '/fabrics/denim/rigid/' },
        { name: 'Indigo Dyed', url: '/fabrics/denim/indigo-dyed/' },
      ]
    },
    {
      name: 'Poly Knit Fabrics',
      slug: '/fabrics/poly-knit-fabrics/',
      catalogUrl: '/fabrics?category=cat-knits',
      infoUrl: '/fabrics/poly-knit-fabrics/',
      description: 'High-performance polyester knits for sportswear and activewear. GSM range from 140 to 280.',
      image: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600&h=400&fit=crop',
      specs: ['140-280 GSM', 'Interlock & Jersey', 'Moisture Wicking', 'Quick Dry'],
      subpages: [
        { name: '180 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/180-gsm/' },
        { name: '220 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/220-gsm/' },
        { name: '240 GSM Poly Knit', url: '/fabrics/poly-knit-fabrics/240-gsm/' },
        { name: 'Interlock', url: '/fabrics/poly-knit-fabrics/interlock/' },
        { name: 'Jersey', url: '/fabrics/poly-knit-fabrics/jersey/' },
        { name: 'Moisture Wicking', url: '/fabrics/poly-knit-fabrics/moisture-wicking/' },
      ]
    }
  ];

  return (
    <>
      <Navbar />
      <main className="pt-20 bg-white" data-testid="fabrics-hub">
        {/* Hero */}
        <section className="py-16 lg:py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="container-main">
            <div className="max-w-4xl">
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
                Fabric Sourcing for Manufacturers & Brands
              </h1>
              <p className="text-xl text-slate-300 mb-8 leading-relaxed">
                Source denim and poly knit fabrics directly from verified Indian mills. Transparent pricing, quality assurance, and logistics support for bulk orders.
              </p>
              <Link
                to="/assisted-sourcing"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Raise Your Requirement
                <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        </section>

        {/* Categories Grid */}
        <section className="py-16">
          <div className="container-main">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Fabric Categories</h2>
            <p className="text-slate-600 mb-12 max-w-2xl">
              We specialize in two high-demand fabric categories. Each category is supported by a curated network of mills with verified production capabilities.
            </p>

            <div className="grid lg:grid-cols-2 gap-8">
              {categories.map((category, index) => (
                <div key={index} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-[3/2] overflow-hidden">
                    <img 
                      src={category.image} 
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-8">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">{category.name}</h3>
                    <p className="text-slate-600 mb-6">{category.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      {category.specs.map((spec, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-full">
                          {spec}
                        </span>
                      ))}
                    </div>

                    <div className="border-t border-slate-200 pt-6 mb-6">
                      <p className="text-sm font-medium text-slate-700 mb-3">Popular Specifications:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {category.subpages.map((page, i) => (
                          <Link
                            key={i}
                            to={page.url}
                            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            {page.name}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <Link
                      to={category.catalogUrl}
                      className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-slate-800 transition-colors"
                    >
                      Browse {category.name}
                      <ArrowRight size={18} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 bg-slate-50">
          <div className="container-main">
            <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">How Fabric Sourcing Works</h2>
            <p className="text-slate-600 mb-12 text-center max-w-2xl mx-auto">
              A simple four-step process to get quality fabrics from verified Indian mills.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { step: '1', title: 'Share Requirement', desc: 'Tell us your fabric type, specifications, quantity, and delivery timeline.' },
                { step: '2', title: 'Compare Responses', desc: 'Review detailed quotes from multiple verified mills with full specifications.' },
                { step: '3', title: 'Confirm Order', desc: 'Finalize pricing, approve samples, and confirm production schedule.' },
                { step: '4', title: 'Logistics & Payment', desc: 'We handle dispatch coordination and secure milestone-based payments.' }
              ].map((item, index) => (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Locofast */}
        <section className="py-16 bg-white">
          <div className="container-main">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">Why Source Through Locofast</h2>
              <p className="text-slate-600 mb-12 text-center">
                Built for brands, manufacturers, and buying houses who need reliable fabric supply.
              </p>

              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  { title: 'Category Expertise', desc: 'Deep focus on denim and knit fabrics with curated mill relationships built over years.' },
                  { title: 'Verified Mills', desc: 'Every supplier is screened for production capacity, quality standards, and delivery reliability.' },
                  { title: 'Direct Communication', desc: 'Connect with mills directly. No hidden markups or middlemen commissions.' },
                  { title: 'Transparent Pricing', desc: 'Compare specifications and pricing across multiple suppliers before deciding.' },
                  { title: 'Logistics Support', desc: 'End-to-end coordination from production to delivery at your warehouse.' },
                  { title: 'Payment Safety', desc: 'Secure payment processing with milestone-based release to protect both parties.' }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4 p-4">
                    <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                      <p className="text-slate-600 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-blue-600">
          <div className="container-main text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Source Your Fabric?</h2>
            <p className="text-blue-100 mb-8 max-w-xl mx-auto">
              Share your requirements and get responses from verified mills within 48 hours.
            </p>
            <Link
              to="/assisted-sourcing"
              className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Raise Your Requirement
              <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default FabricsHub;
