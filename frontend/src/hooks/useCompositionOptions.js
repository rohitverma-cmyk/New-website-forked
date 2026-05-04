import { useEffect, useState } from "react";

const API = process.env.REACT_APP_BACKEND_URL;

// Module-level cache so every form uses the same list without refetching
let _cache = null;
let _pending = null;

const FALLBACK = [
  "Cotton",
  "Organic Cotton",
  "Recycled Cotton",
  "Polyester",
  "Recycled Polyester",
  "Viscose",
  "Lyocell",
  "Modal",
  "Lycra",
  "Linen",
  "Hemp",
  "Nylon",
  "Wool",
  "Silk",
  "Bamboo",
  "Acrylic",
  "Cashmere",
  "Lurex",
  "Jute",
  "Rayon",
];

/**
 * Returns the canonical composition options (code-owned in backend).
 * Falls back to the hardcoded list if the request fails so the form is never empty.
 */
export default function useCompositionOptions() {
  const [options, setOptions] = useState(_cache || FALLBACK);

  useEffect(() => {
    if (_cache) return;
    if (!_pending) {
      _pending = fetch(`${API}/api/composition/options`)
        .then((r) => (r.ok ? r.json() : { options: FALLBACK }))
        .then((d) => {
          _cache = Array.isArray(d?.options) && d.options.length ? d.options : FALLBACK;
          return _cache;
        })
        .catch(() => {
          _cache = FALLBACK;
          return _cache;
        });
    }
    _pending.then((list) => setOptions(list));
  }, []);

  return options;
}
