import React, { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function ProfitMarginCalculator() {
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [desiredMargin, setDesiredMargin] = useState('');
  const [mode, setMode] = useState('selling'); // 'selling' or 'margin'
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    if (!costPrice || parseFloat(costPrice) <= 0) {
      setError('Please enter a valid cost price');
      return;
    }
    
    if (mode === 'selling' && (!sellingPrice || parseFloat(sellingPrice) <= 0)) {
      setError('Please enter a valid selling price');
      return;
    }
    
    if (mode === 'margin' && (!desiredMargin || parseFloat(desiredMargin) <= 0 || parseFloat(desiredMargin) >= 100)) {
      setError('Please enter a valid margin percentage (0-100)');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const payload = {
        cost_price: parseFloat(costPrice)
      };
      
      if (mode === 'selling') {
        payload.selling_price = parseFloat(sellingPrice);
      } else {
        payload.desired_margin = parseFloat(desiredMargin);
      }
      
      const response = await api.post('/tools/profit-margin-calculator', payload);
      setResult(response.data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout
      title="Profit Margin Calculator"
      description="Calculate profit margins and optimal selling prices for your fabrics"
      icon={BarChart3}
      iconColor="bg-green-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              What do you want to calculate?
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => { setMode('selling'); setResult(null); }}
                className={`flex-1 px-4 py-3 rounded-lg border font-medium transition-colors ${
                  mode === 'selling'
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-selling"
              >
                Profit from Selling Price
              </button>
              <button
                onClick={() => { setMode('margin'); setResult(null); }}
                className={`flex-1 px-4 py-3 rounded-lg border font-medium transition-colors ${
                  mode === 'margin'
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-margin"
              >
                Selling Price from Margin
              </button>
            </div>
          </div>

          {/* Cost Price Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cost Price (₹ per meter)
            </label>
            <input
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Enter cost price"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
              data-testid="cost-price-input"
            />
          </div>

          {/* Conditional Input based on mode */}
          {mode === 'selling' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Selling Price (₹ per meter)
              </label>
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Enter selling price"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                data-testid="selling-price-input"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Desired Profit Margin (%)
              </label>
              <input
                type="number"
                value={desiredMargin}
                onChange={(e) => setDesiredMargin(e.target.value)}
                placeholder="Enter desired margin"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                data-testid="desired-margin-input"
              />
              <div className="flex gap-2 mt-2">
                {['10', '15', '20', '25', '30'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDesiredMargin(m)}
                    className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {m}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-green-500 text-white py-3 rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
            data-testid="calculate-margin-btn"
          >
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Cost Price</div>
                <div className="text-xl font-bold text-slate-800" data-testid="result-cost">
                  ₹{result.cost_price.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Selling Price</div>
                <div className="text-xl font-bold text-slate-800" data-testid="result-selling">
                  ₹{result.selling_price.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Profit</div>
                <div className="text-xl font-bold text-green-700" data-testid="result-profit">
                  ₹{result.profit.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Profit Margin</div>
                <div className="text-xl font-bold text-green-700" data-testid="result-margin">
                  {result.profit_margin_percentage}%
                </div>
              </div>
              <div className="col-span-2 bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600">Markup Percentage</div>
                <div className="text-xl font-bold text-blue-700" data-testid="result-markup">
                  {result.markup_percentage}%
                </div>
                <div className="text-xs text-blue-500 mt-1">
                  Markup = (Profit / Cost) × 100
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-green-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-green-900 mb-2">Margin vs Markup</h4>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• <strong>Profit Margin:</strong> Profit as percentage of selling price</li>
              <li>• <strong>Markup:</strong> Profit as percentage of cost price</li>
              <li>• Example: ₹100 cost, ₹150 selling = 33.3% margin, 50% markup</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
