import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FileText, Percent, Scale, Box, Weight, BarChart3, Type, Barcode, Sparkles } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

const tools = [
  {
    category: 'Calculators',
    items: [
      {
        id: 'gst-calculator',
        name: 'GST Calculator',
        description: 'Calculate GST, CGST & SGST for your fabric purchases instantly',
        icon: Calculator,
        path: '/tools/gst-calculator',
        color: 'bg-blue-500'
      },
      {
        id: 'profit-margin-calculator',
        name: 'Profit Margin Calculator',
        description: 'Calculate profit margins and optimal selling prices',
        icon: BarChart3,
        path: '/tools/profit-margin-calculator',
        color: 'bg-green-500'
      },
      {
        id: 'discount-calculator',
        name: 'Discount Calculator',
        description: 'Quickly determine discounts for bulk orders',
        icon: Percent,
        path: '/tools/discount-calculator',
        color: 'bg-purple-500'
      },
      {
        id: 'gsm-calculator',
        name: 'GSM Calculator',
        description: 'Convert fabric weight to GSM or oz/sq yard',
        icon: Scale,
        path: '/tools/gsm-calculator',
        color: 'bg-orange-500'
      },
      {
        id: 'cbm-calculator',
        name: 'CBM Calculator',
        description: 'Calculate cargo volume for shipping fabric rolls',
        icon: Box,
        path: '/tools/cbm-calculator',
        color: 'bg-cyan-500'
      },
      {
        id: 'volumetric-weight-calculator',
        name: 'Volumetric Weight Calculator',
        description: 'Calculate dimensional weight for courier shipping',
        icon: Weight,
        path: '/tools/volumetric-weight-calculator',
        color: 'bg-pink-500'
      }
    ]
  },
  {
    category: 'AI-Powered Tools',
    items: [
      {
        id: 'product-description-generator',
        name: 'Product Description Generator',
        description: 'Generate compelling fabric descriptions with AI',
        icon: FileText,
        path: '/tools/product-description-generator',
        color: 'bg-indigo-500',
        badge: 'AI'
      },
      {
        id: 'product-title-generator',
        name: 'Product Title Generator',
        description: 'Create SEO-friendly product titles instantly',
        icon: Type,
        path: '/tools/product-title-generator',
        color: 'bg-violet-500',
        badge: 'AI'
      }
    ]
  },
  {
    category: 'Utility Tools',
    items: [
      {
        id: 'barcode-generator',
        name: 'Barcode Generator',
        description: 'Generate barcodes for fabric inventory management',
        icon: Barcode,
        path: '/tools/barcode-generator',
        color: 'bg-slate-600'
      }
    ]
  }
];

export default function ToolsPage() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        {/* Hero Section */}
        <div className="bg-slate-900 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Sparkles className="w-12 h-12 text-amber-400" />
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
                Free Tools for Fabric Business
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
                Simplify your day-to-day tasks with our suite of calculators and AI-powered tools
              </p>
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {tools.map((category) => (
            <div key={category.category} className="mb-12">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                {category.category}
                {category.category === 'AI-Powered Tools' && (
                  <span className="text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-2 py-1 rounded-full">
                    Powered by GPT
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.items.map((tool) => (
                  <Link
                    key={tool.id}
                    to={tool.path}
                    className="group bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-200"
                    data-testid={`tool-card-${tool.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`${tool.color} p-3 rounded-lg text-white group-hover:scale-110 transition-transform`}>
                        <tool.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-800 group-hover:text-slate-900">
                            {tool.name}
                          </h3>
                          {tool.badge && (
                            <span className="text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-2 py-0.5 rounded">
                              {tool.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="bg-slate-100 py-12">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h3 className="text-xl font-semibold text-slate-800 mb-4">
              Looking for fabric samples?
            </h3>
            <p className="text-slate-600 mb-6">
              Explore our verified supplier network and source premium fabrics with confidence.
            </p>
            <Link
              to="/fabrics"
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
              data-testid="explore-fabrics-btn"
            >
              Explore Fabrics
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
