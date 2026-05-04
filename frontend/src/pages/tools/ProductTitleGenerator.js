import React, { useState } from 'react';
import { Type, Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function ProductTitleGenerator() {
  const [formData, setFormData] = useState({
    product_name: '',
    fabric_type: '',
    composition: '',
    color: '',
    key_feature: ''
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGenerate = async () => {
    if (!formData.product_name) {
      setError('Please enter a product name');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const payload = {
        product_name: formData.product_name
      };
      
      if (formData.fabric_type) payload.fabric_type = formData.fabric_type;
      if (formData.composition) payload.composition = formData.composition;
      if (formData.color) payload.color = formData.color;
      if (formData.key_feature) payload.key_feature = formData.key_feature;
      
      const response = await api.post('/tools/product-title-generator', payload);
      setResult(response.data);
    } catch (err) {
      setError('Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const fabricTypes = ['Woven', 'Knitted', 'Denim', 'Non-woven', 'Lace', 'Embroidered'];
  const keyFeatures = ['Sustainable', 'Stretch', 'Wrinkle-free', 'Moisture-wicking', 'Premium', 'Budget-friendly'];

  return (
    <ToolLayout
      title="Product Title Generator"
      description="Generate SEO-friendly product titles for your fabric listings"
      icon={Type}
      iconColor="bg-violet-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="product_name"
              value={formData.product_name}
              onChange={handleChange}
              placeholder="e.g., Cotton Single Jersey"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              data-testid="title-product-name"
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fabric Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Fabric Type
              </label>
              <select
                name="fabric_type"
                value={formData.fabric_type}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                data-testid="title-fabric-type"
              >
                <option value="">Select type</option>
                {fabricTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Composition */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Composition
              </label>
              <input
                type="text"
                name="composition"
                value={formData.composition}
                onChange={handleChange}
                placeholder="e.g., 100% Cotton"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                data-testid="title-composition"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Color
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleChange}
                placeholder="e.g., White, Navy Blue"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                data-testid="title-color"
              />
            </div>

            {/* Key Feature */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Key Feature
              </label>
              <select
                name="key_feature"
                value={formData.key_feature}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                data-testid="title-key-feature"
              >
                <option value="">Select feature</option>
                {keyFeatures.map((feature) => (
                  <option key={feature} value={feature}>{feature}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-500 text-white py-3 rounded-lg font-medium hover:from-violet-600 hover:to-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="generate-title-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating with AI...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Titles
              </>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Generated Titles</h3>
            <div className="space-y-3">
              {result.suggestions.map((title, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between bg-slate-50 p-4 rounded-lg group hover:bg-violet-50 transition-colors"
                  data-testid={`generated-title-${index}`}
                >
                  <span className="text-slate-800 flex-1">{title}</span>
                  <button
                    onClick={() => handleCopy(title, index)}
                    className="ml-3 p-2 text-slate-400 hover:text-violet-600 transition-colors"
                    data-testid={`copy-title-${index}`}
                  >
                    {copiedIndex === index ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SEO Tips */}
      <div className="mt-8 bg-violet-50 rounded-xl p-6">
        <h4 className="font-medium text-violet-900 mb-3">SEO Tips for Product Titles</h4>
        <ul className="text-sm text-violet-800 space-y-2">
          <li>• <strong>Keep it under 70 characters</strong> for optimal display in search results</li>
          <li>• <strong>Front-load keywords</strong> - put the most important words first</li>
          <li>• <strong>Include key specs</strong> - composition, weight, or finish</li>
          <li>• <strong>Avoid keyword stuffing</strong> - keep it natural and readable</li>
          <li>• <strong>Use pipes or dashes</strong> to separate different attributes</li>
        </ul>
      </div>
    </ToolLayout>
  );
}
