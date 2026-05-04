import React, { useState } from 'react';
import { Box, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import api from '../../lib/api';

export default function CBMCalculator() {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
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
      const response = await api.post('/tools/cbm-calculator', {
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        quantity: parseInt(quantity) || 1
      });
      setResult(response.data);
    } catch (err) {
      setError('Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout
      title="CBM Calculator"
      description="Calculate cargo volume (Cubic Meters) for shipping fabric rolls"
      icon={Box}
      iconColor="bg-cyan-500"
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
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                data-testid="cbm-length-input"
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
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                data-testid="cbm-width-input"
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
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                data-testid="cbm-height-input"
              />
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Number of Packages
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantity"
              min="1"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              data-testid="cbm-quantity-input"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-cyan-500 text-white py-3 rounded-lg font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50"
            data-testid="calculate-cbm-btn"
          >
            {loading ? 'Calculating...' : 'Calculate CBM'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Calculation Result</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Dimensions (m)</div>
                <div className="text-lg font-bold text-slate-800" data-testid="result-dimensions">
                  {result.length_m} × {result.width_m} × {result.height_m}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Quantity</div>
                <div className="text-lg font-bold text-slate-800" data-testid="result-quantity">
                  {result.quantity} packages
                </div>
              </div>
              <div className="bg-cyan-50 p-4 rounded-lg">
                <div className="text-sm text-cyan-600">CBM per Unit</div>
                <div className="text-xl font-bold text-cyan-700" data-testid="result-cbm-unit">
                  {result.cbm_per_unit} m³
                </div>
              </div>
              <div className="bg-cyan-50 p-4 rounded-lg">
                <div className="text-sm text-cyan-600">Total CBM</div>
                <div className="text-xl font-bold text-cyan-700" data-testid="result-cbm-total">
                  {result.total_cbm} m³
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-cyan-50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-cyan-900 mb-2">Common Fabric Roll Sizes</h4>
            <ul className="text-sm text-cyan-800 space-y-1">
              <li>• <strong>Standard roll:</strong> 150cm × 25cm × 25cm (~0.09 CBM)</li>
              <li>• <strong>Large roll:</strong> 150cm × 35cm × 35cm (~0.18 CBM)</li>
              <li>• <strong>20ft container:</strong> ~28 CBM capacity</li>
              <li>• <strong>40ft container:</strong> ~58 CBM capacity</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
