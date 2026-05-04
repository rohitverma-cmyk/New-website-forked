import { createContext, useContext, useEffect, useState, useCallback } from "react";

const BrandCartContext = createContext(null);

const STORAGE_KEY = "lf_brand_cart_v1";

/**
 * Brand portal cart.
 *
 * A line is: {fabric_id, fabric_name, fabric_code, category_name, image_url,
 *             quantity, unit, color_name, color_hex, order_type: 'sample' | 'bulk',
 *             price_per_unit, moq, seller_company}.
 *
 * We deliberately keep sample and bulk lines *separate* — they have different
 * unit economics (samples capped at 5m, sample price per swatch; bulk uses
 * rate_per_meter and respects MOQ), checkout via different balances, and it's
 * more intuitive for the buyer to see "5 sample requests" vs "2 bulk orders"
 * as distinct sections.
 */
export const BrandCartProvider = ({ children }) => {
  const [lines, setLines] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch { /* quota / privacy — ignore */ }
  }, [lines]);

  const addLine = useCallback((line) => {
    setLines((prev) => {
      // Merge with an existing line that has the same fabric + color + type
      const idx = prev.findIndex((l) =>
        l.fabric_id === line.fabric_id &&
        l.order_type === line.order_type &&
        (l.color_name || "") === (line.color_name || "")
      );
      if (idx >= 0) {
        const merged = [...prev];
        const existing = merged[idx];
        const newQty = Number(existing.quantity) + Number(line.quantity);
        merged[idx] = { ...existing, quantity: line.order_type === "sample" ? Math.min(5, newQty) : newQty };
        return merged;
      }
      return [...prev, { ...line, id: `${line.fabric_id}-${line.order_type}-${line.color_name || "_"}-${Date.now()}` }];
    });
  }, []);

  const updateQty = useCallback((lineId, qty) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const capped = l.order_type === "sample" ? Math.max(1, Math.min(5, Number(qty) || 1)) : Math.max(1, Number(qty) || 1);
        return { ...l, quantity: capped };
      })
    );
  }, []);

  const removeLine = useCallback((lineId) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const bulkLines = lines.filter((l) => l.order_type === "bulk");
  const sampleLines = lines.filter((l) => l.order_type === "sample");

  const bulkSubtotal = bulkLines.reduce((s, l) => s + Number(l.price_per_unit) * Number(l.quantity), 0);
  const sampleSubtotal = sampleLines.reduce((s, l) => s + Number(l.price_per_unit) * Number(l.quantity), 0);

  return (
    <BrandCartContext.Provider value={{
      lines,
      bulkLines,
      sampleLines,
      bulkSubtotal,
      sampleSubtotal,
      itemCount: lines.length,
      addLine,
      updateQty,
      removeLine,
      clear,
    }}>
      {children}
    </BrandCartContext.Provider>
  );
};

export const useBrandCart = () => {
  const ctx = useContext(BrandCartContext);
  if (!ctx) throw new Error("useBrandCart must be used inside BrandCartProvider");
  return ctx;
};
