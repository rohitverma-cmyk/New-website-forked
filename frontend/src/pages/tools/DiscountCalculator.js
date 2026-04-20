import React, { useState } from 'react';
import { Percent, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function DiscountCalculator() {
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [mode, setMode] = useState('percent'); // 'percent', 'amount', 'final'
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    if (!originalPrice || parseFloat(originalPrice) <= 0) {
      setError('Please enter a valid original price');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const payload = {
        original_price: parseFloat(originalPrice)
      };
      
      if (mode === 'percent' && discountPercent) {
        payload.discount_percentage = parseFloat(discountPercent);
      } else if (mode === 'amount' && discountAmount) {
        payload.discount_amount = parseFloat(discountAmount);
      } else if (mode === 'final' && finalPrice) {
        payload.final_price = parseFloat(finalPrice);
      } else {
        setError('Please enter the required value');
        setLoading(false);
        return;
      }
      
      const response = await api.post('/tools/discount-calculator', payload);
      setResult(response.data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickDiscounts = ['5', '10', '15', '20', '25', '30'];

  return (
    <ToolLayout
      title="Discount Calculator"
      description="Calculate discounts for bulk fabric orders"
      icon={Percent}
      iconColor="bg-purple-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Original Price Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Original Price (₹)
            </label>
            <input
              type="number"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="Enter original price"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
              data-testid="original-price-input"
            />
          </div>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Calculate Using
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setMode('percent'); setResult(null); }}
                className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                  mode === 'percent'
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-percent"
              >
                Discount %
              </button>
              <button
                onClick={() => { setMode('amount'); setResult(null); }}
                className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                  mode === 'amount'
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-amount"
              >
                Discount Amount
              </button>
              <button
                onClick={() => { setMode('final'); setResult(null); }}
                className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                  mode === 'final'
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-final"
              >
                Final Price
              </button>
            </div>
          </div>

          {/* Conditional Input based on mode */}
          {mode === 'percent' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Discount Percentage (%)
              </label>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="Enter discount percentage"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                data-testid="discount-percent-input"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {quickDiscounts.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiscountPercent(d)}
                    className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {d}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'amount' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Discount Amount (₹)
              </label>
              <input
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="Enter discount amount"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                data-testid="discount-amount-input"
              />
            </div>
          )}

          {mode === 'final' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Final Price After Discount (₹)
              </label>
              <input
                type="number"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                placeholder="Enter final price"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                data-testid="final-price-input"
              />
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-purple-500 text-white py-3 rounded-lg font-medium hover:bg-purple-600 transition-colors disabled:opacity-50"
            data-testid="calculate-discount-btn"
          >
            {loading ? 'Calculating...' : 'Calculate Discount'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Original Price</div>
                <div className="text-xl font-bold text-slate-800" data-testid="result-original">
                  ₹{result.original_price.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600">Discount</div>
                <div className="text-xl font-bold text-purple-700" data-testid="result-discount">
                  {result.discount_percentage}%
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600">You Save</div>
                <div className="text-xl font-bold text-red-700" data-testid="result-savings">
                  ₹{result.savings.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Final Price</div>
                <div className="text-xl font-bold text-green-700" data-testid="result-final">
                  ₹{result.final_price.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-purple-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-purple-900 mb-2">Bulk Order Discounts</h4>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• <strong>5-10%:</strong> Orders above 500 meters</li>
              <li>• <strong>10-15%:</strong> Orders above 1000 meters</li>
              <li>• <strong>15-20%:</strong> Orders above 2500 meters</li>
              <li>• <strong>20%+:</strong> Bulk/wholesale orders (negotiate directly)</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
