import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Download, Search, Loader2 } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { useConfirm } from "../../components/useConfirm";
import api, { getEnquiries, updateEnquiryStatus, deleteEnquiry } from "../../lib/api";

const STATUS_OPTIONS = ["new", "contacted", "in_progress", "completed", "closed"];

// Source labels & tone. The DB stores raw `source` strings that vary
// in casing/format across years of imports (e.g. `rfq_page`,
// `Homepage RFQ Form`, `SKU Page RFQ`). We collapse them into a small
// set of buckets the admin actually cares about — the filter pills
// query the backend with the bucket key, which we'll match using a
// loose regex in the API.
const SOURCE_META = {
  rfq: { label: "RFQ", tone: "bg-violet-100 text-violet-700",
         match: /rfq|quote/i },
  fabric_page: { label: "Fabric Page", tone: "bg-emerald-100 text-emerald-700",
                 match: /pdp|fabric|sku|catalog/i },
  supplier: { label: "Supplier Signup", tone: "bg-pink-100 text-pink-700",
              match: /supplier|seller/i },
  agent_assistance: { label: "Agent Assistance", tone: "bg-cyan-100 text-cyan-700",
                      match: /agent[_ -]?assist/i },
  cart_abandonment: { label: "Cart Abandonment", tone: "bg-red-100 text-red-700",
                      match: /cart[_ -]?aband|dropoff/i },
  contact_form: { label: "Contact Form", tone: "bg-gray-100 text-gray-700",
                  match: /contact|homepage|website|general|^$/i },
  external: { label: "Imported", tone: "bg-amber-100 text-amber-700",
              match: /hubspot|salesforce|meta|zapier|external|partner/i },
};

const bucketOf = (src) => {
  const s = (src || "").trim();
  if (!s) return "contact_form";
  for (const [key, meta] of Object.entries(SOURCE_META)) {
    if (meta.match.test(s)) return key;
  }
  return "contact_form";
};

const AdminEnquiries = () => {
  const confirm = useConfirm();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Filters — passed straight to the backend so the table stays
  // server-paginated friendly even as enquiry volume grows.
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  // Debounced search to avoid a fetch on every keystroke.
  const [searchDraft, setSearchDraft] = useState("");

  const statusOptions = STATUS_OPTIONS;

  useEffect(() => {
    fetchEnquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);  // source filter is client-side (bucketed regex)

  // Debounce text input → push to `search` 350ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const fetchEnquiries = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await getEnquiries(params);
      setEnquiries(res.data);
    } catch (err) {
      toast.error("Failed to load enquiries");
    }
    setLoading(false);
  };

  // Apply the client-side source bucket filter (server doesn't know
  // about our regex buckets — only raw source strings).
  const filteredEnquiries = useMemo(() => {
    if (!sourceFilter) return enquiries;
    return enquiries.filter((e) => bucketOf(e.source) === sourceFilter);
  }, [enquiries, sourceFilter]);

  // Counts per bucket — based on the current (server-filtered) list.
  const sourceCounts = useMemo(() => {
    const out = { __all__: enquiries.length };
    for (const e of enquiries) {
      const b = bucketOf(e.source);
      out[b] = (out[b] || 0) + 1;
    }
    return out;
  }, [enquiries]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const search_params = {};
      if (statusFilter) search_params.status = statusFilter;
      if (search) search_params.search = search;
      const res = await api.get("/enquiries/export.csv", {
        params: search_params,
        responseType: "blob",
      });
      // If a source bucket is selected, filter the CSV client-side too
      // so the download matches what's visible on screen.
      let blob = res.data;
      if (sourceFilter) {
        const text = await blob.text();
        const [header, ...rows] = text.split("\n");
        // Source is column index 1 in the CSV (created_at, source, ...)
        const kept = rows.filter((line) => {
          if (!line.trim()) return false;
          const cols = line.split(",");
          return bucketOf(cols[1] || "") === sourceFilter;
        });
        blob = new Blob([[header, ...kept].join("\n")], { type: "text/csv" });
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `locofast-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleStatusChange = async (enquiryId, status) => {
    try {
      await updateEnquiryStatus(enquiryId, status);
      toast.success("Status updated");
      fetchEnquiries();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (enquiryId, e) => {
    e.stopPropagation();
    if (!(await confirm({ title: "Delete enquiry", message: "Are you sure you want to delete this enquiry?", tone: "danger", confirmLabel: "Delete" }))) return;
    
    setDeleting(enquiryId);
    try {
      await deleteEnquiry(enquiryId);
      toast.success("Enquiry deleted");
      if (selectedEnquiry?.id === enquiryId) {
        setSelectedEnquiry(null);
      }
      fetchEnquiries();
    } catch (err) {
      toast.error("Failed to delete enquiry");
    }
    setDeleting(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "new":
        return "bg-blue-50 text-blue-700";
      case "contacted":
        return "bg-amber-50 text-amber-700";
      case "in_progress":
        return "bg-purple-50 text-purple-700";
      case "completed":
        return "bg-emerald-50 text-emerald-700";
      case "closed":
        return "bg-neutral-100 text-neutral-600";
      default:
        return "bg-neutral-100 text-neutral-600";
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-enquiries-page">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-serif font-medium">Enquiries</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Every customer who reached out — quote requests, contact forms, and agent assistance.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || enquiries.length === 0}
            className="bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-neutral-800"
            data-testid="admin-enquiries-download"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download CSV
          </button>
        </div>

        {/* Filter strip — source pills + status dropdown + search */}
        <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2" data-testid="admin-enquiries-filters">
          <button
            onClick={() => setSourceFilter("")}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border ${sourceFilter === "" ? "bg-neutral-900 text-white border-neutral-900" : "bg-neutral-50 text-neutral-600 border-transparent hover:bg-neutral-100"}`}
            data-testid="admin-enquiries-source-all"
          >
            All <span className="ml-1 opacity-70">{sourceCounts.__all__ ?? 0}</span>
          </button>
          {Object.entries(SOURCE_META).map(([k, m]) => (
            <button
              key={k}
              onClick={() => setSourceFilter(sourceFilter === k ? "" : k)}
              className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${sourceFilter === k ? `${m.tone} border-current/30` : "bg-neutral-50 text-neutral-600 border-transparent hover:bg-neutral-100"}`}
              data-testid={`admin-enquiries-source-${k}`}
            >
              {m.label}
              {sourceCounts[k] != null && <span className="ml-1 opacity-70">{sourceCounts[k]}</span>}
            </button>
          ))}
          <div className="h-5 w-px bg-neutral-200 mx-1" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            data-testid="admin-enquiries-status-filter"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search name, email, company, message…"
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              data-testid="admin-enquiries-search"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white p-4 border border-neutral-100 animate-pulse">
                <div className="h-5 bg-neutral-200 w-1/4 mb-2" />
                <div className="h-4 bg-neutral-200 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredEnquiries.length === 0 ? (
          <div className="text-center py-20 bg-white border border-neutral-100" data-testid="no-enquiries">
            <p className="text-neutral-500">No enquiries match the current filters</p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-100 overflow-hidden" data-testid="enquiries-table">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <th className="text-left p-4 font-medium text-sm">Contact</th>
                    <th className="text-left p-4 font-medium text-sm">Source</th>
                    <th className="text-left p-4 font-medium text-sm">Fabric</th>
                    <th className="text-left p-4 font-medium text-sm">Message</th>
                    <th className="text-left p-4 font-medium text-sm">Date</th>
                    <th className="text-left p-4 font-medium text-sm">Status</th>
                    <th className="text-right p-4 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnquiries.map((enquiry) => (
                    <tr
                      key={enquiry.id}
                      className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 cursor-pointer"
                      onClick={() => setSelectedEnquiry(enquiry)}
                      data-testid={`enquiry-row-${enquiry.id}`}
                    >
                      <td className="p-4">
                        <p className="font-medium">{enquiry.name}</p>
                        <p className="text-sm text-neutral-500">{enquiry.email}</p>
                        {enquiry.company && (
                          <p className="text-sm text-neutral-400">{enquiry.company}</p>
                        )}
                      </td>
                      <td className="p-4">
                        {(() => {
                          const bk = bucketOf(enquiry.source);
                          const meta = SOURCE_META[bk];
                          return (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${meta.tone}`} data-testid={`enquiry-source-${enquiry.id}`}>
                              {meta.label}
                            </span>
                          );
                        })()}
                        {enquiry.enquiry_type && enquiry.enquiry_type !== 'general' && (
                          <span className={`ml-1 text-xs px-2 py-1 rounded-full font-medium ${
                            enquiry.enquiry_type === 'sample_order' ? 'bg-amber-100 text-amber-700' :
                            enquiry.enquiry_type === 'bulk_order' ? 'bg-green-100 text-green-700' :
                            enquiry.enquiry_type === 'rfq' ? 'bg-blue-100 text-blue-700' :
                            'bg-neutral-100 text-neutral-600'
                          }`}>
                            {enquiry.enquiry_type === 'sample_order' ? 'Sample' :
                             enquiry.enquiry_type === 'bulk_order' ? 'Bulk' :
                             enquiry.enquiry_type === 'rfq' ? 'RFQ' :
                             enquiry.enquiry_type === 'supplier_signup' ? 'Supplier' :
                             enquiry.enquiry_type}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-neutral-600">
                        {enquiry.fabric_name || "General Enquiry"}
                      </td>
                      <td className="p-4 max-w-xs">
                        <p className="text-neutral-600 truncate">{enquiry.message}</p>
                      </td>
                      <td className="p-4 text-neutral-500 text-sm">
                        {format(new Date(enquiry.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="p-4">
                        <select
                          value={enquiry.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(enquiry.id, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`px-3 py-1 text-sm rounded-sm border-0 ${getStatusColor(enquiry.status)}`}
                          data-testid={`status-select-${enquiry.id}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => handleDelete(enquiry.id, e)}
                          disabled={deleting === enquiry.id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete enquiry"
                          data-testid={`delete-enquiry-${enquiry.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {selectedEnquiry && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSelectedEnquiry(null)}
            data-testid="enquiry-modal"
          >
            <div
              className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100">
                <h2 className="text-xl font-serif font-medium">Enquiry Details</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="subheading mb-1">Contact</p>
                  <p className="font-medium">{selectedEnquiry.name}</p>
                  <p className="text-neutral-600">{selectedEnquiry.email}</p>
                  {selectedEnquiry.phone && <p className="text-neutral-600">{selectedEnquiry.phone}</p>}
                  {selectedEnquiry.company && <p className="text-neutral-500">{selectedEnquiry.company}</p>}
                </div>

                {selectedEnquiry.fabric_name && (
                  <div>
                    <p className="subheading mb-1">Fabric</p>
                    <p>{selectedEnquiry.fabric_name}</p>
                  </div>
                )}

                <div>
                  <p className="subheading mb-1">Message</p>
                  <p className="text-neutral-600 whitespace-pre-wrap">{selectedEnquiry.message}</p>
                </div>

                <div>
                  <p className="subheading mb-1">Date</p>
                  <p>{format(new Date(selectedEnquiry.created_at), "PPpp")}</p>
                </div>

                <div>
                  <p className="subheading mb-1">Status</p>
                  <select
                    value={selectedEnquiry.status}
                    onChange={(e) => {
                      handleStatusChange(selectedEnquiry.id, e.target.value);
                      setSelectedEnquiry({ ...selectedEnquiry, status: e.target.value });
                    }}
                    className={`px-3 py-2 text-sm rounded-sm border-0 ${getStatusColor(selectedEnquiry.status)}`}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-neutral-100">
                <button onClick={() => setSelectedEnquiry(null)} className="btn-secondary w-full">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEnquiries;
