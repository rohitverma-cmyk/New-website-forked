import React, { useState, useRef, useEffect } from 'react';
import { Barcode as BarcodeIcon, Download, Copy, Check, Info } from 'lucide-react';
import ToolLayout from './ToolLayout';
import JsBarcode from 'jsbarcode';

export default function BarcodeGenerator() {
  const [data, setData] = useState('');
  const [barcodeType, setBarcodeType] = useState('CODE128');
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const svgRef = useRef(null);

  const barcodeTypes = [
    { value: 'CODE128', label: 'CODE128', description: 'Supports all ASCII characters' },
    { value: 'EAN13', label: 'EAN-13', description: '12 digits + auto check digit' },
    { value: 'UPC', label: 'UPC-A', description: '11 digits + auto check digit' },
    { value: 'CODE39', label: 'CODE39', description: 'Alphanumeric (A-Z, 0-9)' }
  ];

  const validateInput = () => {
    if (!data) {
      return 'Please enter data to encode';
    }
    
    if (barcodeType === 'EAN13') {
      if (!/^\d{12}$/.test(data)) {
        return 'EAN-13 requires exactly 12 digits';
      }
    } else if (barcodeType === 'UPC') {
      if (!/^\d{11}$/.test(data)) {
        return 'UPC requires exactly 11 digits';
      }
    } else if (barcodeType === 'CODE39') {
      if (!/^[A-Z0-9\-.\s$\/+%]+$/i.test(data)) {
        return 'CODE39 only supports A-Z, 0-9, and special characters (- . $ / + %)';
      }
    }
    
    return null;
  };

  const handleGenerate = () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      setGenerated(false);
      return;
    }
    
    setError('');
    setGenerated(true);
  };

  useEffect(() => {
    if (generated && svgRef.current && data) {
      try {
        JsBarcode(svgRef.current, data, {
          format: barcodeType,
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 16,
          margin: 10,
          background: '#ffffff'
        });
      } catch (err) {
        setError('Failed to generate barcode. Please check your input.');
        setGenerated(false);
      }
    }
  }, [generated, data, barcodeType]);

  const handleDownload = () => {
    if (!svgRef.current) return;
    
    // Create a canvas and draw the SVG
    const svg = svgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Get SVG dimensions
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // Download
      const link = document.createElement('a');
      link.download = `barcode-${data}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sampleCodes = {
    CODE128: ['SKU-12345', 'FABRIC-001', 'LS-AB123'],
    EAN13: ['590123456789', '400599951000', '871234567890'],
    UPC: ['01234567890', '12345678901', '98765432101'],
    CODE39: ['ABC123', 'ROLL-001', 'DENIM-XL']
  };

  return (
    <ToolLayout
      title="Barcode Generator"
      description="Generate barcodes for fabric inventory management"
      icon={BarcodeIcon}
      iconColor="bg-slate-600"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-6">
          {/* Barcode Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Barcode Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {barcodeTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => { setBarcodeType(type.value); setGenerated(false); }}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    barcodeType === type.value
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                  data-testid={`barcode-type-${type.value}`}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className={`text-xs mt-1 ${barcodeType === type.value ? 'text-slate-300' : 'text-slate-400'}`}>
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Data Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Data to Encode
            </label>
            <input
              type="text"
              value={data}
              onChange={(e) => { setData(e.target.value); setGenerated(false); }}
              placeholder={`Enter ${barcodeType} data`}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-lg font-mono"
              data-testid="barcode-data-input"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-xs text-slate-500">Examples:</span>
              {sampleCodes[barcodeType].map((code) => (
                <button
                  key={code}
                  onClick={() => { setData(code); setGenerated(false); }}
                  className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 font-mono"
                >
                  {code}
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
            className="w-full bg-slate-800 text-white py-3 rounded-lg font-medium hover:bg-slate-900 transition-colors"
            data-testid="generate-barcode-btn"
          >
            Generate Barcode
          </button>
        </div>

        {/* Result */}
        {generated && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Generated Barcode</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
                  data-testid="copy-barcode-data"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Data
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                  data-testid="download-barcode"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border-2 border-dashed border-slate-200 flex justify-center">
              <svg ref={svgRef} data-testid="barcode-svg"></svg>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-slate-100 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-slate-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-slate-800 mb-2">Barcode Types Explained</h4>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• <strong>CODE128:</strong> Most versatile, supports full ASCII. Ideal for internal SKUs.</li>
              <li>• <strong>EAN-13:</strong> International retail standard. Used for global product identification.</li>
              <li>• <strong>UPC-A:</strong> North American retail standard. Common in US/Canada.</li>
              <li>• <strong>CODE39:</strong> Simple alphanumeric. Good for industrial applications.</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
