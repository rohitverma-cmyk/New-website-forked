import React, { useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function GSTCalculator() {
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [isInclusive, setIsInclusive] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/tools/gst-calculator', {
        amount: parseFloat(amount),
        gst_rate: parseFloat(gstRate),
        is_inclusive: isInclusive
      });
      setResult(response.data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const gstRates = ['5', '12', '18', '28'];

  return (
    <ToolLayout
      title="GST Calculator"
      description="Calculate GST, CGST & SGST for your fabric business"
      icon={Calculator}
      iconColor="bg-blue-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Amount (₹)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              data-testid="gst-amount-input"
            />
          </div>

          {/* GST Rate Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              GST Rate (%)
            </label>
            <div className="flex flex-wrap gap-3">
              {gstRates.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setGstRate(rate)}
                  className={`px-6 py-2 rounded-lg border font-medium transition-colors ${
                    gstRate === rate
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                  data-testid={`gst-rate-${rate}`}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>

          {/* Inclusive/Exclusive Toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Price Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!isInclusive}
                  onChange={() => setIsInclusive(false)}
                  className="w-4 h-4 text-blue-500"
                  data-testid="gst-exclusive"
                />
                <span className="text-slate-700">GST Exclusive</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={isInclusive}
                  onChange={() => setIsInclusive(true)}
                  className="w-4 h-4 text-blue-500"
                  data-testid="gst-inclusive"
                />
                <span className="text-slate-700">GST Inclusive</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            data-testid="calculate-gst-btn"
          >
            {loading ? 'Calculating...' : 'Calculate GST'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Base Amount</div>
                <div className="text-xl font-bold text-slate-800" data-testid="result-base">
                  ₹{result.original_amount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Total GST ({result.gst_rate}%)</div>
                <div className="text-xl font-bold text-slate-800" data-testid="result-gst">
                  ₹{result.gst_amount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600">CGST ({result.gst_rate/2}%)</div>
                <div className="text-xl font-bold text-blue-700" data-testid="result-cgst">
                  ₹{result.cgst.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600">SGST ({result.gst_rate/2}%)</div>
                <div className="text-xl font-bold text-blue-700" data-testid="result-sgst">
                  ₹{result.sgst.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="col-span-2 bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Total Amount</div>
                <div className="text-2xl font-bold text-green-700" data-testid="result-total">
                  ₹{result.total_amount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-blue-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 mb-2">About GST Rates in Fabric Industry</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>5% GST:</strong> Cotton fabrics, silk fabrics, wool fabrics</li>
              <li>• <strong>12% GST:</strong> Embroidered fabrics, technical textiles</li>
              <li>• <strong>18% GST:</strong> Man-made fabrics, blended fabrics</li>
              <li>• <strong>28% GST:</strong> Luxury fabrics, specialized textiles</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
