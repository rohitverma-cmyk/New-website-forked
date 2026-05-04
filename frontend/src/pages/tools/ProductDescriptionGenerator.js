import React, { useState } from 'react';
import { FileText, Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function ProductDescriptionGenerator() {
  const [formData, setFormData] = useState({
    product_name: '',
    fabric_type: '',
    composition: '',
    gsm: '',
    width: '',
    color: '',
    finish: '',
    use_cases: '',
    tone: 'professional'
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
        product_name: formData.product_name,
        tone: formData.tone
      };
      
      if (formData.fabric_type) payload.fabric_type = formData.fabric_type;
      if (formData.composition) payload.composition = formData.composition;
      if (formData.gsm) payload.gsm = parseInt(formData.gsm);
      if (formData.width) payload.width = formData.width;
      if (formData.color) payload.color = formData.color;
      if (formData.finish) payload.finish = formData.finish;
      if (formData.use_cases) payload.use_cases = formData.use_cases;
      
      const response = await api.post('/tools/product-description-generator', payload);
      setResult(response.data);
    } catch (err) {
      setError('Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.generated_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tones = [
    { value: 'professional', label: 'Professional B2B' },
    { value: 'casual', label: 'Casual & Friendly' },
    { value: 'luxury', label: 'Premium & Luxury' }
  ];

  const fabricTypes = ['Woven', 'Knitted', 'Denim', 'Non-woven', 'Lace', 'Embroidered'];
  const finishes = ['Bio-washed', 'Mercerized', 'Enzyme-washed', 'Silicon', 'Peached', 'Brushed'];

  return (
    <ToolLayout
      title="Product Description Generator"
      description="Generate compelling AI-powered descriptions for your fabrics"
      icon={FileText}
      iconColor="bg-indigo-500"
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
              placeholder="e.g., Cotton Poplin 40x60"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              data-testid="desc-product-name"
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
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-fabric-type"
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
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-composition"
              />
            </div>

            {/* GSM */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                GSM
              </label>
              <input
                type="number"
                name="gsm"
                value={formData.gsm}
                onChange={handleChange}
                placeholder="e.g., 180"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-gsm"
              />
            </div>

            {/* Width */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Width
              </label>
              <input
                type="text"
                name="width"
                value={formData.width}
                onChange={handleChange}
                placeholder="e.g., 58 inches"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-width"
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
                placeholder="e.g., Navy Blue"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-color"
              />
            </div>

            {/* Finish */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Finish
              </label>
              <select
                name="finish"
                value={formData.finish}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="desc-finish"
              >
                <option value="">Select finish</option>
                {finishes.map((finish) => (
                  <option key={finish} value={finish}>{finish}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Use Cases */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Ideal Use Cases
            </label>
            <input
              type="text"
              name="use_cases"
              value={formData.use_cases}
              onChange={handleChange}
              placeholder="e.g., T-shirts, Casual wear, Athleisure"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              data-testid="desc-use-cases"
            />
          </div>

          {/* Tone Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Writing Tone
            </label>
            <div className="flex flex-wrap gap-3">
              {tones.map((tone) => (
                <button
                  key={tone.value}
                  onClick={() => setFormData({ ...formData, tone: tone.value })}
                  className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                    formData.tone === tone.value
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                  data-testid={`tone-${tone.value}`}
                >
                  {tone.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-3 rounded-lg font-medium hover:from-indigo-600 hover:to-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="generate-description-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating with AI...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Description
              </>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Generated Description</h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                data-testid="copy-description-btn"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div 
              className="bg-slate-50 p-6 rounded-xl prose prose-slate max-w-none"
              data-testid="generated-description"
            >
              <p className="whitespace-pre-wrap">{result.generated_text}</p>
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
