/**
 * AgentAISearchBar — natural-language search for the agent module.
 *
 * Agent types something like:
 *   "Need 5000m of breathable polo knit, light shade, max ₹220/m,
 *    ready stock from Surat"
 *
 * → Claude parses intent into structured filters and an explanation
 * → We hit /api/fabrics with those filters
 * → Show ranked suggestions with reasoning so the agent can pitch
 *   each option to the client in one click.
 *
 * Backend wiring is gated behind `aiSearchEnabled` — currently UI-only
 * preview (placeholder echo) until the user provides the Anthropic key.
 */
import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, X, Wand2, ArrowUpRight, Lightbulb, Copy, Check } from "lucide-react";

const QUICK_PROMPTS = [
  "5000m light cotton knit, ready stock, under ₹250/m",
  "Heavy denim 12oz+ for jackets, vendor in Ahmedabad",
  "Polo knit pique, white, GOTS certified, 200 GSM",
  "Breathable rayon viscose, dyeable, 30+ days delivery OK",
];

export default function AgentAISearchBar({ onApplyFilters, fabrics = [], onSuggestToClient }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCopied, setShowCopied] = useState(false);
  const textareaRef = useRef(null);

  // Autosize textarea so the input grows with the agent's query
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(140, t.scrollHeight) + "px";
  }, [query]);

  const handleSearch = async (q = query) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      // ⚠️ Placeholder response — replace with /api/agent/ai-search call
      // once Claude key is wired. Backend is expected to return:
      //   { intent, filters, summary, suggestions: [{fabric_id, why}] }
      await new Promise((r) => setTimeout(r, 900));
      // Heuristic parse for the UI preview — picks 4 top fabrics from
      // the currently loaded catalog with mock "reasoning".
      const lc = q.toLowerCase();
      const mockFilters = {
        category: lc.includes("knit") ? "Knits" : lc.includes("denim") ? "Denim" : lc.includes("cotton") ? "Cotton" : null,
        max_price: (lc.match(/(?:under|max|≤)\s*₹?\s*(\d+)/i) || [])[1] || null,
        gsm_min: (lc.match(/(\d{2,3})\s*\+?\s*gsm/i) || [])[1] || null,
        availability: lc.includes("ready stock") || lc.includes("ready-stock") ? "Bookable" : null,
        location: (lc.match(/(?:from|in)\s+([A-Z][a-z]+)/) || [])[1] || null,
      };
      const filtered = (fabrics || []).slice(0, 4).map((f) => ({
        fabric: f,
        why: `Matches your "${lc.split(/[,.]/)[0].trim()}" requirement · MOQ ${f.moq || "—"} · ₹${f.starting_price || f.rate_per_meter || "—"}/m`,
        confidence: 0.85,
      }));
      setResult({
        summary: `Found ${filtered.length} matches based on your description. Filters extracted: ${
          Object.entries(mockFilters)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ") || "none — showing top picks"
        }`,
        filters: mockFilters,
        suggestions: filtered,
      });
      setHistory((h) => [{ q, ts: new Date().toISOString() }, ...h].slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    if (!result?.filters || !onApplyFilters) return;
    onApplyFilters(result.filters);
  };

  const copySuggestion = async (s) => {
    const txt = `${s.fabric.name} (${s.fabric.fabric_code || ""}) — ${s.why}`;
    try {
      await navigator.clipboard.writeText(txt);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 1400);
    } catch {}
  };

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 shadow-sm" data-testid="agent-ai-search">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              AI Sourcing Assistant
              <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">Beta</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Describe what your client needs in plain English — Claude finds the best matches and gives you a pitch.</p>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="px-5 pb-3">
        <div className="relative bg-white rounded-xl border border-indigo-200/70 shadow-inner focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            rows={1}
            placeholder='Try: "5000m of lightweight cotton knit, white, under ₹220/m, ready stock from Surat"'
            className="w-full resize-none rounded-xl px-4 py-3 pr-28 text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
            data-testid="agent-ai-search-input"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
            {query && (
              <button onClick={() => { setQuery(""); setResult(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100" data-testid="agent-ai-search-clear">
                <X size={14} />
              </button>
            )}
            <button
              onClick={() => handleSearch()}
              disabled={!query.trim() || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-semibold shadow-sm hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="agent-ai-search-submit"
            >
              {loading ? <><Loader2 size={13} className="animate-spin" />Thinking…</> : <><Wand2 size={13} />Ask Claude</>}
            </button>
          </div>
        </div>

        {/* Quick prompt chips */}
        {!result && !loading && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mt-1.5">Try:</span>
            {QUICK_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setQuery(p); setTimeout(() => handleSearch(p), 50); }}
                className="text-xs px-2.5 py-1 rounded-full bg-white border border-indigo-200/60 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                data-testid={`agent-ai-quick-prompt-${i}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result panel */}
      {result && (
        <div className="border-t border-indigo-100 bg-white/80 rounded-b-2xl">
          {/* Summary */}
          <div className="px-5 py-3 flex items-start gap-2.5 border-b border-gray-100">
            <Lightbulb size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-700 leading-relaxed">{result.summary}</p>
              {result.filters && Object.values(result.filters).some(Boolean) && onApplyFilters && (
                <button onClick={handleApplyFilters} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1" data-testid="agent-ai-apply-filters">
                  Apply these filters to the catalog <ArrowUpRight size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Suggestions */}
          {result.suggestions && result.suggestions.length > 0 && (
            <div className="px-5 py-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Top picks to pitch</p>
              {result.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group" data-testid={`agent-ai-suggestion-${i}`}>
                  {s.fabric?.image_url && (
                    <img src={s.fabric.image_url} alt={s.fabric.name} className="w-12 h-12 rounded-md object-cover border border-gray-200 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 line-clamp-1">{s.fabric?.name || "Fabric"}</p>
                      {s.confidence && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{Math.round(s.confidence * 100)}% match</span>}
                    </div>
                    {s.fabric?.fabric_code && <p className="text-[11px] text-gray-500 font-mono mt-0.5">{s.fabric.fabric_code}</p>}
                    <p className="text-xs text-gray-600 mt-1 leading-snug">{s.why}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => copySuggestion(s)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-md border border-transparent hover:border-indigo-200"
                      title="Copy pitch to clipboard"
                      data-testid={`agent-ai-copy-${i}`}
                    >
                      {showCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                    {onSuggestToClient && (
                      <button
                        onClick={() => onSuggestToClient(s.fabric)}
                        className="px-2 py-1 text-[10px] font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1 whitespace-nowrap"
                        data-testid={`agent-ai-suggest-${i}`}
                      >
                        <Send size={10} />Suggest
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
            <span>Powered by Claude · Suggestions are AI-generated; verify before sharing</span>
            <button onClick={() => { setResult(null); setQuery(""); }} className="hover:text-gray-600" data-testid="agent-ai-search-reset">
              New search
            </button>
          </div>
        </div>
      )}

      {/* Recent searches */}
      {!result && history.length > 0 && (
        <div className="px-5 pb-4 -mt-1">
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1.5">Recent</p>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 3).map((h, i) => (
              <button
                key={i}
                onClick={() => { setQuery(h.q); setTimeout(() => handleSearch(h.q), 50); }}
                className="text-xs px-2 py-1 rounded-md bg-white text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 max-w-xs truncate"
                title={h.q}
              >
                {h.q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
