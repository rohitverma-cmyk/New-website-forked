import React, { useState } from 'react';
import { Scale, Info, ArrowRight } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function GSMCalculator() {
  const [mode, setMode] = useState('dimensions'); // 'dimensions' or 'ounce'
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [weight, setWeight] = useState('');
  const [ounceValue, setOunceValue] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    setLoading(true);
    setError('');
    
    try {
      let payload = {};
      
      if (mode === 'dimensions') {
        if (!length || !width || !weight || parseFloat(length) <= 0 || parseFloat(width) <= 0 || parseFloat(weight) <= 0) {
          setError('Please enter valid dimensions and weight');
          setLoading(false);
          return;
        }
        payload = {
          length: parseFloat(length),
          width: parseFloat(width),
          weight: parseFloat(weight)
        };
      } else {
        if (!ounceValue || parseFloat(ounceValue) <= 0) {
          setError('Please enter a valid ounce value');
          setLoading(false);
          return;
        }
        payload = {
          length: 1,
          width: 1,
          weight: 1,
          from_ounce: parseFloat(ounceValue)
        };
      }
      
      const response = await api.post('/tools/gsm-calculator', payload);
      setResult(response.data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const commonOunces = ['4', '6', '8', '10', '12', '14'];

  return (
    <ToolLayout
      title="GSM Calculator"
      description="Calculate fabric weight in GSM or convert from oz/sq yard"
      icon={Scale}
      iconColor="bg-orange-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Calculate GSM From
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => { setMode('dimensions'); setResult(null); }}
                className={`flex-1 px-4 py-3 rounded-lg border font-medium transition-colors ${
                  mode === 'dimensions'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-dimensions"
              >
                Fabric Dimensions
              </button>
              <button
                onClick={() => { setMode('ounce'); setResult(null); }}
                className={`flex-1 px-4 py-3 rounded-lg border font-medium transition-colors ${
                  mode === 'ounce'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                data-testid="mode-ounce"
              >
                Ounce/sq yard
              </button>
            </div>
          </div>

          {mode === 'dimensions' ? (
            <>
              {/* Length Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sample Length (meters)
                </label>
                <input
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  placeholder="e.g., 0.1 for 10cm"
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg"
                  data-testid="gsm-length-input"
                />
              </div>

              {/* Width Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sample Width (meters)
                </label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="e.g., 0.1 for 10cm"
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg"
                  data-testid="gsm-width-input"
                />
              </div>

              {/* Weight Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sample Weight (grams)
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Enter weight in grams"
                  step="0.1"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg"
                  data-testid="gsm-weight-input"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Weight (oz/sq yard)
              </label>
              <input
                type="number"
                value={ounceValue}
                onChange={(e) => setOunceValue(e.target.value)}
                placeholder="Enter ounce per square yard"
                step="0.25"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg"
                data-testid="gsm-ounce-input"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {commonOunces.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOunceValue(o)}
                    className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {o} oz
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
            className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            data-testid="calculate-gsm-btn"
          >
            {loading ? 'Calculating...' : 'Calculate GSM'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-6 rounded-xl">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-700" data-testid="result-gsm">
                    {result.gsm}
                  </div>
                  <div className="text-sm text-orange-600">GSM</div>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-700" data-testid="result-oz">
                    {result.oz_per_sq_yard}
                  </div>
                  <div className="text-sm text-amber-600">oz/sq yard</div>
                </div>
              </div>
              <p className="text-center text-slate-600 mt-4 text-sm">
                {result.description}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Conversion Table */}
      <div className="mt-8 bg-orange-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-500 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-orange-900 mb-3">GSM Reference Guide</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white p-3 rounded-lg text-center">
                <div className="font-bold text-orange-700">80-120</div>
                <div className="text-slate-600">Light (Voile)</div>
              </div>
              <div className="bg-white p-3 rounded-lg text-center">
                <div className="font-bold text-orange-700">150-200</div>
                <div className="text-slate-600">Medium (T-Shirts)</div>
              </div>
              <div className="bg-white p-3 rounded-lg text-center">
                <div className="font-bold text-orange-700">250-350</div>
                <div className="text-slate-600">Heavy (Denim)</div>
              </div>
              <div className="bg-white p-3 rounded-lg text-center">
                <div className="font-bold text-orange-700">400+</div>
                <div className="text-slate-600">Very Heavy</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
