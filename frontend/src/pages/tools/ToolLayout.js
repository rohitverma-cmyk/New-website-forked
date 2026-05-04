import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

export default function ToolLayout({ title, description, icon: Icon, iconColor, children }) {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Link to="/" className="text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <Home className="w-4 h-4" />
              </Link>
              <span className="text-slate-400">/</span>
              <Link to="/tools" className="text-slate-500 hover:text-slate-700">
                Tools
              </Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-800 font-medium">{title}</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Link 
              to="/tools" 
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4 text-sm"
              data-testid="back-to-tools"
            >
              <ArrowLeft className="w-4 h-4" />
              All Tools
            </Link>
            <div className="flex items-center gap-4">
              {Icon && (
                <div className={`${iconColor || 'bg-slate-600'} p-4 rounded-xl text-white`}>
                  <Icon className="w-8 h-8" />
                </div>
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
                <p className="text-slate-500 mt-1">{description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>

        {/* Related Tools */}
        <div className="bg-slate-50 border-t border-slate-200 py-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h3 className="font-semibold text-slate-800 mb-4">More Free Tools</h3>
            <div className="flex flex-wrap gap-3">
              <Link to="/tools/gst-calculator" className="text-sm bg-white px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800">
                GST Calculator
              </Link>
              <Link to="/tools/profit-margin-calculator" className="text-sm bg-white px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800">
                Profit Margin
              </Link>
              <Link to="/tools/gsm-calculator" className="text-sm bg-white px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800">
                GSM Calculator
              </Link>
              <Link to="/tools/product-description-generator" className="text-sm bg-white px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800">
                AI Description
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
