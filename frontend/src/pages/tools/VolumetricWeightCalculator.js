import React, { useState } from 'react';
import { Weight, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function VolumetricWeightCalculator() {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [divisor, setDivisor] = useState('5000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    if (!length || !width || !height || parseFloat(length) <= 0 || parseFloat(width) <= 0 || parseFloat(height) <= 0) {
      setError('Please enter valid dimensions');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/tools/volumetric-weight-calculator', {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        divisor: parseFloat(divisor)
      });
      setResult({
        ...response.data,
        actual_weight: actualWeight ? parseFloat(actualWeight) : null
      });
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const courierDivisors = [
    { name: 'Standard (5000)', value: '5000' },
    { name: 'DHL/FedEx (5000)', value: '5000' },
    { name: 'Air Freight (6000)', value: '6000' },
    { name: 'Sea Freight (1000)', value: '1000' }
  ];

  const billedWeight = result 
    ? Math.max(result.volumetric_weight_kg, result.actual_weight || 0)
    : null;

  return (
    <ToolLayout
      title="Volumetric Weight Calculator"
      description="Calculate dimensional weight for courier and freight shipping"
      icon={Weight}
      iconColor="bg-pink-500"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Dimensions */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Length (cm)
              </label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="Length"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                data-testid="vol-length-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Width (cm)
              </label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="Width"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                data-testid="vol-width-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Height (cm)
              </label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="Height"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                data-testid="vol-height-input"
              />
            </div>
          </div>

          {/* Actual Weight */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Actual Weight (kg) - Optional
            </label>
            <input
              type="number"
              value={actualWeight}
              onChange={(e) => setActualWeight(e.target.value)}
              placeholder="Enter actual weight to compare"
              step="0.1"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              data-testid="vol-actual-weight-input"
            />
          </div>

          {/* Divisor Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Shipping Method
            </label>
            <div className="flex flex-wrap gap-2">
              {courierDivisors.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDivisor(d.value)}
                  className={`px-4 py-2 rounded-lg border font-medium transition-colors text-sm ${
                    divisor === d.value
                      ? 'bg-pink-500 text-white border-pink-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium hover:bg-pink-600 transition-colors disabled:opacity-50"
            data-testid="calculate-vol-btn"
          >
            {loading ? 'Calculating...' : 'Calculate Volumetric Weight'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Volume</div>
                <div className="text-lg font-bold text-slate-800" data-testid="result-volume">
                  {result.volume_cm3.toLocaleString()} cm³
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Divisor Used</div>
                <div className="text-lg font-bold text-slate-800" data-testid="result-divisor">
                  {result.divisor_used}
                </div>
              </div>
              <div className="bg-pink-50 p-4 rounded-lg">
                <div className="text-sm text-pink-600">Volumetric Weight</div>
                <div className="text-xl font-bold text-pink-700" data-testid="result-vol-weight">
                  {result.volumetric_weight_kg} kg
                </div>
              </div>
              {result.actual_weight && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600">Actual Weight</div>
                  <div className="text-xl font-bold text-blue-700" data-testid="result-actual-weight">
                    {result.actual_weight} kg
                  </div>
                </div>
              )}
              {billedWeight && (
                <div className="col-span-2 bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600">Billed Weight (Higher of the two)</div>
                  <div className="text-2xl font-bold text-green-700" data-testid="result-billed-weight">
                    {billedWeight} kg
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    Couriers charge based on the higher weight
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-pink-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-pink-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-pink-900 mb-2">Volumetric Weight Formula</h4>
            <ul className="text-sm text-pink-800 space-y-1">
              <li>• <strong>Formula:</strong> (L × W × H) ÷ Divisor = Volumetric Weight</li>
              <li>• <strong>Standard divisor:</strong> 5000 for courier, 6000 for air freight</li>
              <li>• <strong>Billing:</strong> Couriers charge whichever is higher - actual or volumetric</li>
              <li>• <strong>Tip:</strong> Reduce package size to lower shipping costs</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
