import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Eye, AlertTriangle, Check, ChevronDown, ChevronUp, Sparkles, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getFabrics, getFabricSEO, generateFabricSEO, regenerateSEOBlock, updateFabricSEO, getSEOPreview, batchGenerateSlugs, batchFillMissingSEOStart, batchFillMissingSEOStatus, batchFillMissingSEOLatest, batchFillMissingSEOResume, seoAudit } from "../../lib/api";

const AdminFabricSEO = () => {
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFabric, setSelectedFabric] = useState(null);
  const [seoContent, setSeoContent] = useState(null);
  const [seoPreview, setSeoPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [regeneratingBlock, setRegeneratingBlock] = useState(null);
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [editingBlock, setEditingBlock] = useState(null);
  const [editValue, setEditValue] = useState("");

  const loadFabrics = useCallback(async () => {
    try {
      const res = await getFabrics({ limit: 1000 });
      setFabrics(res.data);
    } catch (err) {
      toast.error("Failed to load fabrics");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFabrics();
  }, [loadFabrics]);

  const selectFabric = async (fabric) => {
    setSelectedFabric(fabric);
    setSeoContent(null);
    setSeoPreview(null);
    
    try {
      const [seoRes, previewRes] = await Promise.all([
        getFabricSEO(fabric.id),
        getSEOPreview(fabric.id)
      ]);
      setSeoContent(seoRes.data);
      setSeoPreview(previewRes.data);
    } catch (err) {
      console.error("Error loading SEO:", err);
    }
  };

  const handleGenerateSEO = async () => {
    if (!selectedFabric) return;
    
    setGenerating(true);
    try {
      const res = await generateFabricSEO(selectedFabric.id);
      setSeoContent(res.data);
      const previewRes = await getSEOPreview(selectedFabric.id);
      setSeoPreview(previewRes.data);
      toast.success("SEO content generated successfully");
    } catch (err) {
      toast.error("Failed to generate SEO content");
    }
    setGenerating(false);
  };

  const handleRegenerateBlock = async (blockName) => {
    if (!selectedFabric) return;
    
    setRegeneratingBlock(blockName);
    try {
      await regenerateSEOBlock(selectedFabric.id, blockName);
      // Reload SEO content
      const res = await getFabricSEO(selectedFabric.id);
      setSeoContent(res.data);
      const previewRes = await getSEOPreview(selectedFabric.id);
      setSeoPreview(previewRes.data);
      toast.success(`${blockName} regenerated`);
    } catch (err) {
      toast.error(`Failed to regenerate ${blockName}`);
    }
    setRegeneratingBlock(null);
  };

  const handleToggleMode = async (blockName) => {
    if (!selectedFabric || !seoContent) return;
    
    const currentMode = seoContent.seo_block_modes?.[blockName] || 'auto';
    const newMode = currentMode === 'auto' ? 'manual' : 'auto';
    
    try {
      const updatedModes = {
        ...seoContent.seo_block_modes,
        [blockName]: newMode
      };
      
      await updateFabricSEO(selectedFabric.id, {
        ...seoContent,
        seo_block_modes: updatedModes
      });
      
      setSeoContent({
        ...seoContent,
        seo_block_modes: updatedModes
      });
      
      toast.success(`${blockName} mode set to ${newMode}`);
    } catch (err) {
      toast.error("Failed to update mode");
    }
  };

  const handleSaveBlock = async (blockName, value) => {
    if (!selectedFabric || !seoContent) return;
    
    try {
      const updateData = { ...seoContent };
      updateData[`seo_${blockName}`] = value;
      
      // Set mode to manual when editing
      updateData.seo_block_modes = {
        ...updateData.seo_block_modes,
        [blockName]: 'manual'
      };
      
      await updateFabricSEO(selectedFabric.id, updateData);
      setSeoContent(updateData);
      setEditingBlock(null);
      setEditValue("");
      
      // Refresh preview
      const previewRes = await getSEOPreview(selectedFabric.id);
      setSeoPreview(previewRes.data);
      
      toast.success(`${blockName} updated`);
    } catch (err) {
      toast.error("Failed to save");
    }
  };

  const handleSaveMetaField = async (fieldName, value) => {
    if (!selectedFabric || !seoContent) return;
    
    try {
      const updateData = { ...seoContent, [fieldName]: value };
      await updateFabricSEO(selectedFabric.id, updateData);
      setSeoContent(updateData);
      setEditingBlock(null);
      setEditValue("");
      
      const previewRes = await getSEOPreview(selectedFabric.id);
      setSeoPreview(previewRes.data);
      
      toast.success("Saved");
    } catch (err) {
      toast.error("Failed to save");
    }
  };

  const handleToggleIndex = async () => {
    if (!selectedFabric || !seoContent) return;
    
    try {
      const updateData = { ...seoContent, is_indexed: !seoContent.is_indexed };
      await updateFabricSEO(selectedFabric.id, updateData);
      setSeoContent(updateData);
      toast.success(updateData.is_indexed ? "Page set to Index" : "Page set to Noindex");
    } catch (err) {
      toast.error("Failed to update");
    }
  };

  const handleBatchGenerateSlugs = async () => {
    try {
      const res = await batchGenerateSlugs();
      toast.success(`Generated slugs for ${res.data.updated_count} fabrics`);
      loadFabrics();
    } catch (err) {
      toast.error("Failed to generate slugs");
    }
  };

  // Scans every fabric, calls generate for any with missing/empty SEO
  // fields. Idempotent — second run on a clean corpus is a no-op.
  // Runs as a background job on the server so 400+ fabric corpora don't
  // hang the browser. We poll status every 2s.
  const [fillJob, setFillJob] = useState(null);   // { job_id, status, total, processed, ... }
  const filling = !!(fillJob && (fillJob.status === "running" || fillJob.status === "queued"));

  // Heartbeat watchdog — if the backend hasn't updated the job doc in
  // > 90 seconds while it claims to be "running", the worker is almost
  // certainly dead (orphaned asyncio task after a deploy / restart, or
  // an LLM call hanging past our per-fabric timeout).
  const isStale = (() => {
    if (!fillJob || fillJob.status !== "running") return false;
    const last = fillJob.updated_at || fillJob.started_at;
    if (!last) return false;
    const lastDt = new Date(last);
    if (Number.isNaN(lastDt.getTime())) return false;
    return (Date.now() - lastDt.getTime()) > 90_000;
  })();

  // Resume polling on mount if a previous job is still in flight (or just
  // finished and the admin reloaded the page).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await batchFillMissingSEOLatest();
        if (cancelled) return;
        if (res.data && res.data.job_id) {
          setFillJob(res.data);
        }
      } catch (_) {
        /* no prior job — ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll while the active job is running.
  useEffect(() => {
    if (!fillJob?.job_id) return;
    if (fillJob.status !== "running" && fillJob.status !== "queued") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await batchFillMissingSEOStatus(fillJob.job_id);
        if (cancelled) return;
        setFillJob(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") {
          const { filled_count, errors_count, status } = res.data;
          if (status === "failed") {
            toast.error("SEO fill failed: " + (res.data.fatal_error || "unknown error"));
          } else {
            toast.success(`Filled ${filled_count || 0} fabric${(filled_count || 0) !== 1 ? "s" : ""}${errors_count ? ` · ${errors_count} error(s)` : ""}`);
          }
          loadFabrics();
        }
      } catch (err) {
        if (!cancelled) console.error("poll error", err);
      }
    };
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [fillJob?.job_id, fillJob?.status, loadFabrics]);

  const handleFillMissing = async () => {
    if (filling) return;
    try {
      // Quick audit first so the toast tells ops what they're about to do
      const auditRes = await seoAudit();
      const need = auditRes.data?.needs_fill_count || 0;
      if (need === 0) {
        toast.info("All fabrics already have complete SEO data");
        return;
      }
      const res = await batchFillMissingSEOStart();
      const { job_id, already_running } = res.data || {};
      if (already_running) {
        toast.info("A SEO fill job is already running — attaching to it");
      } else {
        toast.info(`Started SEO fill for ${need} fabric${need > 1 ? "s" : ""} in the background`);
      }
      // Optimistically set job to "queued" so progress panel renders immediately
      setFillJob({ job_id, status: "queued", total: need, processed: 0, filled_count: 0, errors_count: 0 });
    } catch (err) {
      toast.error("Fill failed: " + (err?.response?.data?.detail || err.message || "unknown"));
    }
  };

  const dismissJobPanel = () => {
    // Only allow dismiss when job has finished — running jobs stay visible
    if (fillJob?.status === "completed" || fillJob?.status === "failed" || fillJob?.status === "stalled") {
      setFillJob(null);
    }
  };

  const handleResumeStale = async () => {
    try {
      toast.info("Recovering stuck job…");
      const res = await batchFillMissingSEOResume();
      const { job_id, already_running, healthy, resumed_from } = res.data || {};
      if (healthy) {
        toast.success("Job is healthy — no resume needed");
      } else if (resumed_from) {
        toast.success(`Resumed — old job (${resumed_from.slice(0, 8)}…) marked stalled. New job picking up remaining fabrics.`);
      } else {
        toast.success("Started fresh fill job");
      }
      // Reset local state to start tracking the new job
      setFillJob({ job_id, status: "queued", total: 0, processed: 0, filled_count: 0, errors_count: 0 });
    } catch (err) {
      toast.error("Resume failed: " + (err?.response?.data?.detail || err.message || "unknown"));
    }
  };

  const toggleBlock = (blockName) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [blockName]: !prev[blockName]
    }));
  };

  const filteredFabrics = fabrics.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.fabric_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderBlock = (title, blockName, content, isArray = false) => {
    const mode = seoContent?.seo_block_modes?.[blockName] || 'auto';
    const isExpanded = expandedBlocks[blockName];
    const isEditing = editingBlock === blockName;
    
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4" key={blockName}>
        <div 
          className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
          onClick={() => toggleBlock(blockName)}
        >
          <div className="flex items-center gap-3">
            <h3 className="font-medium">{title}</h3>
            <span className={`px-2 py-0.5 text-xs rounded ${mode === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {mode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleRegenerateBlock(blockName); }}
              disabled={regeneratingBlock === blockName}
              className="p-2 hover:bg-gray-200 rounded disabled:opacity-50"
              title="Regenerate"
            >
              <RefreshCw size={16} className={regeneratingBlock === blockName ? 'animate-spin' : ''} />
            </button>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        
        {isExpanded && (
          <div className="p-4 border-t border-gray-200">
            {isEditing ? (
              <div className="space-y-3">
                {isArray ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full p-3 border rounded-lg font-mono text-sm h-40"
                    placeholder="Enter items, one per line"
                  />
                ) : (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full p-3 border rounded-lg text-sm h-32"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const val = isArray ? editValue.split('\n').filter(l => l.trim()) : editValue;
                      handleSaveBlock(blockName, val);
                    }}
                    className="px-4 py-2 bg-[#2563EB] text-white rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingBlock(null); setEditValue(""); }}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {isArray ? (
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {(content || []).map((item, idx) => (
                      <li key={idx}>{typeof item === 'object' ? JSON.stringify(item) : item}</li>
                    ))}
                    {(!content || content.length === 0) && (
                      <li className="text-gray-400 italic">No content generated</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {content || <span className="text-gray-400 italic">No content generated</span>}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setEditingBlock(blockName);
                      setEditValue(isArray ? (content || []).join('\n') : (content || ''));
                    }}
                    className="text-sm text-[#2563EB] hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleMode(blockName)}
                    className="text-sm text-gray-500 hover:underline"
                  >
                    Set to {mode === 'auto' ? 'Manual' : 'Auto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFAQBlock = () => {
    const blockName = 'faq';
    const mode = seoContent?.seo_block_modes?.[blockName] || 'auto';
    const isExpanded = expandedBlocks[blockName];
    const content = seoContent?.seo_faq || [];
    
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <div 
          className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
          onClick={() => toggleBlock(blockName)}
        >
          <div className="flex items-center gap-3">
            <h3 className="font-medium">FAQ ({content.length} questions)</h3>
            <span className={`px-2 py-0.5 text-xs rounded ${mode === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {mode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleRegenerateBlock(blockName); }}
              disabled={regeneratingBlock === blockName}
              className="p-2 hover:bg-gray-200 rounded disabled:opacity-50"
              title="Regenerate"
            >
              <RefreshCw size={16} className={regeneratingBlock === blockName ? 'animate-spin' : ''} />
            </button>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        
        {isExpanded && (
          <div className="p-4 border-t border-gray-200 space-y-4">
            {content.map((faq, idx) => (
              <div key={idx} className="bg-gray-50 p-4 rounded">
                <p className="font-medium text-gray-900">{faq.question}</p>
                <p className="text-gray-600 mt-1">{faq.answer}</p>
              </div>
            ))}
            {content.length === 0 && (
              <p className="text-gray-400 italic">No FAQ generated</p>
            )}
            <button
              onClick={() => handleToggleMode(blockName)}
              className="text-sm text-gray-500 hover:underline"
            >
              Set to {mode === 'auto' ? 'Manual' : 'Auto'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderBulkDetailsBlock = () => {
    const blockName = 'bulk_details';
    const mode = seoContent?.seo_block_modes?.[blockName] || 'auto';
    const isExpanded = expandedBlocks[blockName];
    const content = seoContent?.seo_bulk_details || {};
    
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <div 
          className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
          onClick={() => toggleBlock(blockName)}
        >
          <div className="flex items-center gap-3">
            <h3 className="font-medium">Bulk Order Details</h3>
            <span className={`px-2 py-0.5 text-xs rounded ${mode === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {mode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleRegenerateBlock(blockName); }}
              disabled={regeneratingBlock === blockName}
              className="p-2 hover:bg-gray-200 rounded disabled:opacity-50"
              title="Regenerate"
            >
              <RefreshCw size={16} className={regeneratingBlock === blockName ? 'animate-spin' : ''} />
            </button>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        
        {isExpanded && (
          <div className="p-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">MOQ</p>
                <p className="font-medium">{content.moq || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Lead Time</p>
                <p className="font-medium">{content.lead_time || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Sampling</p>
                <p className="font-medium">{content.sampling || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Dispatch Region</p>
                <p className="font-medium">{content.dispatch_region || '-'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Fabric List */}
        <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold mb-3">Fabric SEO Manager</h2>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search fabrics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleBatchGenerateSlugs}
              className="w-full mt-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center gap-2"
            >
              <Sparkles size={14} />
              Batch Generate Slugs
            </button>
            <button
              onClick={handleFillMissing}
              disabled={filling}
              className="w-full mt-2 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2"
              data-testid="seo-fill-missing-btn"
              title="Scan every fabric and auto-fill any missing meta title, intro, applications, FAQ, why-this-fabric or bulk-details blocks. Runs in the background — safe to close this tab."
            >
              <Sparkles size={14} className={filling ? "animate-spin" : ""} />
              {filling ? "Filling…" : "Fill Missing SEO"}
            </button>

            {/* Live progress panel — visible whenever there is a job in
                state (running or just-completed). */}
            {fillJob && fillJob.job_id && (
              <div
                className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs"
                data-testid="seo-fill-progress-panel"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-emerald-800">
                    {fillJob.status === "queued" && "Queued…"}
                    {fillJob.status === "running" && "Filling SEO"}
                    {fillJob.status === "completed" && "Done"}
                    {fillJob.status === "failed" && "Failed"}
                  </span>
                  {(fillJob.status === "completed" || fillJob.status === "failed") && (
                    <button
                      onClick={dismissJobPanel}
                      className="text-emerald-700 hover:text-emerald-900"
                      data-testid="seo-fill-progress-dismiss-btn"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* progress bar — use filled+errors so the bar moves
                    on each completed fabric rather than waiting for the
                    next one to start (which was 5s+ per fabric). */}
                <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{
                      width: `${fillJob.total > 0
                        ? Math.min(100, Math.round((((fillJob.filled_count || 0) + (fillJob.errors_count || 0)) / fillJob.total) * 100))
                        : (fillJob.status === "completed" ? 100 : 0)}%`,
                    }}
                  />
                </div>

                <div
                  className="flex items-center justify-between text-emerald-900"
                  data-testid="seo-fill-progress-counts"
                >
                  <span>
                    {(fillJob.filled_count || 0) + (fillJob.errors_count || 0)} / {fillJob.total || 0}
                  </span>
                  <span>
                    {fillJob.total > 0
                      ? `${Math.round((((fillJob.filled_count || 0) + (fillJob.errors_count || 0)) / fillJob.total) * 100)}%`
                      : "0%"}
                  </span>
                </div>

                {fillJob.current_fabric && fillJob.status === "running" && (
                  <p className="mt-1.5 text-[11px] text-emerald-700 truncate" title={fillJob.current_fabric.name}>
                    <RefreshCw size={10} className="inline mr-1 animate-spin" />
                    {fillJob.current_fabric.name}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3 text-[11px] text-emerald-700">
                  <span><Check size={10} className="inline mr-0.5" />{fillJob.filled_count || 0} filled</span>
                  {(fillJob.errors_count || 0) > 0 && (
                    <span className="text-red-600">
                      <AlertTriangle size={10} className="inline mr-0.5" />{fillJob.errors_count} error{fillJob.errors_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(fillJob.skipped_already_complete || 0) > 0 && (
                    <span className="text-gray-500">{fillJob.skipped_already_complete} skipped</span>
                  )}
                </div>

                {fillJob.status === "failed" && fillJob.fatal_error && (
                  <p className="mt-1.5 text-[11px] text-red-700 break-words">{fillJob.fatal_error}</p>
                )}

                {/* Stale-job recovery — surfaces a Resume button if the
                    backend heartbeat has gone quiet for > 90s while the
                    job claims to be running (orphaned task after deploy,
                    or LLM hang past the per-fabric timeout). */}
                {isStale && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px]" data-testid="seo-fill-stale-notice">
                    <p className="text-amber-800 mb-1.5 flex items-start gap-1">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>No progress for &gt;90s — worker may have crashed.</span>
                    </p>
                    <button
                      onClick={handleResumeStale}
                      className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-medium"
                      data-testid="seo-fill-resume-btn"
                    >
                      Resume Fill Job
                    </button>
                  </div>
                )}

                {/* Stalled — the previous run was marked dead by /resume */}
                {fillJob.status === "stalled" && (
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Marked stalled — {fillJob.stalled_reason || "no recent heartbeat"}.
                  </p>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400">Loading...</div>
            ) : (
              filteredFabrics.map(fabric => (
                <div
                  key={fabric.id}
                  onClick={() => selectFabric(fabric)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    selectedFabric?.id === fabric.id ? 'bg-blue-50 border-l-4 border-l-[#2563EB]' : ''
                  }`}
                >
                  <p className="font-medium text-sm truncate">{fabric.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{fabric.fabric_code}</p>
                  <p className="text-xs text-gray-500">{fabric.category_name}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - SEO Editor */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {selectedFabric ? (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-semibold">{selectedFabric.name}</h1>
                  <p className="text-sm text-gray-500">{selectedFabric.fabric_code} • {selectedFabric.category_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`/fabrics/${selectedFabric.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <Eye size={16} />
                    Preview
                  </a>
                  <button
                    onClick={handleGenerateSEO}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate SEO
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* SEO Preview Alert */}
              {seoPreview?.alerts?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="font-medium text-amber-800">SEO Alerts</p>
                      <ul className="mt-2 space-y-1">
                        {seoPreview.alerts.map((alert, idx) => (
                          <li key={idx} className="text-sm text-amber-700">• {alert}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Meta Fields */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                <h2 className="font-semibold mb-4">SEO Meta Fields</h2>
                
                <div className="space-y-4">
                  {/* Meta Title */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Meta Title</label>
                      <span className={`text-xs ${(seoContent?.meta_title?.length || 0) > 60 ? 'text-red-500' : 'text-gray-400'}`}>
                        {seoContent?.meta_title?.length || 0}/60 chars
                      </span>
                    </div>
                    {editingBlock === 'meta_title' ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          maxLength={60}
                        />
                        <button
                          onClick={() => handleSaveMetaField('meta_title', editValue)}
                          className="px-3 py-2 bg-[#2563EB] text-white rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingBlock(null); setEditValue(""); }}
                          className="px-3 py-2 border rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div 
                        className="px-3 py-2 bg-gray-50 rounded-lg text-sm cursor-pointer hover:bg-gray-100"
                        onClick={() => { setEditingBlock('meta_title'); setEditValue(seoContent?.meta_title || ''); }}
                      >
                        {seoContent?.meta_title || <span className="text-gray-400">Click to edit</span>}
                      </div>
                    )}
                  </div>

                  {/* Meta Description */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Meta Description</label>
                      <span className={`text-xs ${(seoContent?.meta_description?.length || 0) > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                        {seoContent?.meta_description?.length || 0}/160 chars
                      </span>
                    </div>
                    {editingBlock === 'meta_description' ? (
                      <div className="space-y-2">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm h-20"
                          maxLength={160}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveMetaField('meta_description', editValue)}
                            className="px-3 py-2 bg-[#2563EB] text-white rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingBlock(null); setEditValue(""); }}
                            className="px-3 py-2 border rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="px-3 py-2 bg-gray-50 rounded-lg text-sm cursor-pointer hover:bg-gray-100"
                        onClick={() => { setEditingBlock('meta_description'); setEditValue(seoContent?.meta_description || ''); }}
                      >
                        {seoContent?.meta_description || <span className="text-gray-400">Click to edit</span>}
                      </div>
                    )}
                  </div>

                  {/* Canonical URL */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Canonical URL</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono text-gray-600">
                      {seoContent?.canonical_url || '-'}
                    </div>
                  </div>

                  {/* Indexing Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Indexing</p>
                      <p className="text-xs text-gray-500">Allow search engines to index this page</p>
                    </div>
                    <button
                      onClick={handleToggleIndex}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        seoContent?.is_indexed !== false
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {seoContent?.is_indexed !== false ? 'Index' : 'Noindex'}
                    </button>
                  </div>
                </div>
              </div>

              {/* SEO Content Blocks */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">SEO Content Blocks</h2>
                
                {renderBlock("SEO H1", "h1", seoContent?.seo_h1)}
                {renderBlock("Introduction (120-160 words)", "intro", seoContent?.seo_intro)}
                {renderBlock("Applications / Use Cases", "applications", seoContent?.seo_applications, true)}
                {renderBulkDetailsBlock()}
                {renderBlock("Why This Fabric", "why_fabric", seoContent?.seo_why_fabric, true)}
                {renderFAQBlock()}
              </div>

              {/* Related Fabrics */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h2 className="font-semibold mb-4">Related Fabrics Override</h2>
                <p className="text-sm text-gray-500 mb-4">
                  By default, related fabrics are auto-selected based on category and similar specs. 
                  You can override up to 3 items manually.
                </p>
                <div className="text-sm text-gray-400 italic">
                  {(seoContent?.related_fabric_overrides?.length || 0) === 0 
                    ? "No manual overrides - using auto-selection" 
                    : `${seoContent.related_fabric_overrides.length} manual override(s)`
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Search size={48} className="mx-auto mb-4 opacity-50" />
                <p>Select a fabric to manage SEO content</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminFabricSEO;
