import { useState, useEffect } from "react";
import { Wallet, Clock, CheckCircle, XCircle, Search, RefreshCw, Eye, X, FileText, ChevronDown } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getCreditApplications, approveCreditApplication, rejectCreditApplication } from "../../lib/api";
import { toast } from "sonner";

const COMPANY_TYPE_LABELS = {
  proprietorship: "Sole Proprietorship",
  partnership_llp: "Partnership / LLP",
  pvt_ltd: "Private Limited",
};

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
};

const AdminCreditApplications = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedApp, setSelectedApp] = useState(null);
  // Approve modal
  const [approveModal, setApproveModal] = useState(null);
  const [creditLimit, setCreditLimit] = useState("");
  // Reject modal
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => { fetchApps(); }, []);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res = await getCreditApplications();
      setApps(res.data || []);
    } catch { toast.error("Failed to load applications"); }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!approveModal || !creditLimit) return;
    try {
      await approveCreditApplication(approveModal.id, parseFloat(creditLimit));
      toast.success(`Credit of Rs ${parseFloat(creditLimit).toLocaleString()} approved for ${approveModal.company}`);
      setApproveModal(null); setCreditLimit("");
      fetchApps();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to approve"); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await rejectCreditApplication(rejectModal.id, rejectReason || "Does not meet criteria");
      toast.success("Application rejected");
      setRejectModal(null); setRejectReason("");
      fetchApps();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to reject"); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  const filtered = apps.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return a.name?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s) || a.company?.toLowerCase().includes(s) || a.phone?.includes(search);
  });

  const pendingCount = apps.filter(a => a.status === "pending").length;
  const approvedCount = apps.filter(a => a.status === "approved").length;
  const rejectedCount = apps.filter(a => a.status === "rejected").length;

  return (
    <AdminLayout>
      <div className="p-8" data-testid="admin-credit-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Credit Applications</h1>
            <p className="text-gray-500 mt-1">Review, approve or reject credit line requests</p>
          </div>
          <button onClick={fetchApps} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-lg border"><p className="text-sm text-gray-500">Total</p><p className="text-3xl font-semibold">{apps.length}</p></div>
          <div className="bg-yellow-50 p-5 rounded-lg border border-yellow-200"><p className="text-sm text-yellow-700">Pending Review</p><p className="text-3xl font-semibold text-yellow-700">{pendingCount}</p></div>
          <div className="bg-emerald-50 p-5 rounded-lg border border-emerald-200"><p className="text-sm text-emerald-700">Approved</p><p className="text-3xl font-semibold text-emerald-700">{approvedCount}</p></div>
          <div className="bg-red-50 p-5 rounded-lg border border-red-200"><p className="text-sm text-red-700">Rejected</p><p className="text-3xl font-semibold text-red-700">{rejectedCount}</p></div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, email, company..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="credit-app-search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Applications Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> : filtered.length === 0 ? <div className="p-8 text-center text-gray-500">No applications found</div> : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b"><tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Turnover</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GST</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((app) => {
                  const si = STATUS_CONFIG[app.status] || STATUS_CONFIG.pending;
                  const SI = si.icon;
                  const docs = app.documents || [];
                  const totalDocs = docs.length;
                  const providedDocs = docs.filter(d => d.provided).length;
                  return (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{app.name}</p>
                        <p className="text-sm text-gray-500">{app.email}</p>
                        <p className="text-xs text-gray-400">{app.phone}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {COMPANY_TYPE_LABELS[app.company_type] || app.company_type || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900">{app.turnover || "—"}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 font-mono">{app.gst_number || "—"}</td>
                      <td className="px-4 py-4">
                        {totalDocs > 0 ? (
                          <span className={`text-sm font-medium ${providedDocs === totalDocs ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {providedDocs}/{totalDocs}
                          </span>
                        ) : <span className="text-xs text-gray-400">None</span>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${si.color}`}>
                          <SI size={12} />{si.label}
                        </span>
                        {app.credit_limit > 0 && app.status === 'approved' && (
                          <p className="text-xs text-emerald-600 mt-1 font-medium">Limit: Rs {app.credit_limit.toLocaleString()}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{formatDate(app.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedApp(app)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="View Details" data-testid={`view-app-${app.id}`}>
                            <Eye size={16} />
                          </button>
                          {app.status === "pending" && (
                            <>
                              <button onClick={() => { setApproveModal(app); setCreditLimit(""); }} className="p-2 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded" title="Approve" data-testid={`approve-app-${app.id}`}>
                                <CheckCircle size={16} />
                              </button>
                              <button onClick={() => { setRejectModal(app); setRejectReason(""); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Reject" data-testid={`reject-app-${app.id}`}>
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ===== DETAIL MODAL ===== */}
        {selectedApp && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedApp(null)}>
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="app-detail-modal">
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{selectedApp.company}</h2>
                  <p className="text-sm text-gray-500">{COMPANY_TYPE_LABELS[selectedApp.company_type] || selectedApp.company_type} | Applied {formatDate(selectedApp.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => { const si = STATUS_CONFIG[selectedApp.status] || STATUS_CONFIG.pending; return <span className={`px-3 py-1 rounded-full text-sm font-medium ${si.color}`}>{si.label}</span>; })()}
                  <button onClick={() => setSelectedApp(null)}><X size={20} className="text-gray-400" /></button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Applicant Info */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Name", value: selectedApp.name },
                    { label: "Company", value: selectedApp.company },
                    { label: "Email", value: selectedApp.email },
                    { label: "Phone", value: selectedApp.phone },
                    { label: "GST Number", value: selectedApp.gst_number || "—" },
                    { label: "Turnover", value: selectedApp.turnover || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="font-medium text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Documents */}
                {selectedApp.documents && selectedApp.documents.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText size={16} /> Documents Submitted</h3>
                    <div className="space-y-2">
                      {selectedApp.documents.map((doc, idx) => (
                        <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${doc.provided ? 'bg-emerald-50/50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center gap-2">
                            {doc.provided ? <CheckCircle size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-gray-400" />}
                            <span className="text-sm text-gray-800">{doc.label}</span>
                            {doc.required && <span className="text-xs text-red-400">*</span>}
                          </div>
                          <div>
                            {doc.filename ? (
                              <span className="text-xs text-emerald-600 font-medium">{doc.filename}</span>
                            ) : doc.provided ? (
                              <span className="text-xs text-emerald-600">Confirmed</span>
                            ) : (
                              <span className="text-xs text-gray-400">Not provided</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection reason */}
                {selectedApp.status === 'rejected' && selectedApp.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700"><span className="font-medium">Rejection reason:</span> {selectedApp.rejection_reason}</p>
                  </div>
                )}

                {/* Approved credit limit */}
                {selectedApp.status === 'approved' && selectedApp.credit_limit > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <p className="text-sm text-emerald-700"><span className="font-medium">Approved Credit Limit:</span> Rs {selectedApp.credit_limit.toLocaleString()}</p>
                  </div>
                )}
              </div>
              <div className="p-6 border-t flex justify-between">
                {selectedApp.status === "pending" ? (
                  <div className="flex gap-3 w-full">
                    <button onClick={() => { setSelectedApp(null); setApproveModal(selectedApp); setCreditLimit(""); }} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center justify-center gap-2">
                      <CheckCircle size={16} /> Approve
                    </button>
                    <button onClick={() => { setSelectedApp(null); setRejectModal(selectedApp); setRejectReason(""); }} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2">
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setSelectedApp(null)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 ml-auto">Close</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== APPROVE MODAL ===== */}
        {approveModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setApproveModal(null)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="approve-modal">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-100 rounded-full"><CheckCircle size={20} className="text-emerald-600" /></div>
                <div>
                  <h3 className="text-lg font-semibold">Approve Credit</h3>
                  <p className="text-sm text-gray-500">{approveModal.company} | {approveModal.name}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-1">
                <p className="text-sm"><span className="text-gray-500">Turnover:</span> <span className="font-medium">{approveModal.turnover}</span></p>
                <p className="text-sm"><span className="text-gray-500">Type:</span> <span className="font-medium">{COMPANY_TYPE_LABELS[approveModal.company_type] || approveModal.company_type}</span></p>
                <p className="text-sm"><span className="text-gray-500">GST:</span> <span className="font-mono">{approveModal.gst_number || '—'}</span></p>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit (Rs) *</label>
                <input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="e.g. 500000" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-lg font-semibold" autoFocus data-testid="approve-credit-limit" />
                {creditLimit && <p className="text-sm text-emerald-600 mt-1 font-medium">Rs {parseFloat(creditLimit).toLocaleString()}</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setApproveModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleApprove} disabled={!creditLimit || parseFloat(creditLimit) <= 0} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium" data-testid="confirm-approve-btn">Approve & Create Wallet</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== REJECT MODAL ===== */}
        {rejectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="reject-modal">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full"><XCircle size={20} className="text-red-600" /></div>
                <div>
                  <h3 className="text-lg font-semibold">Reject Application</h3>
                  <p className="text-sm text-gray-500">{rejectModal.company} | {rejectModal.name}</p>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Rejection</label>
                <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-red-500 focus:outline-none mb-2">
                  <option value="">Select reason</option>
                  <option value="Turnover below minimum threshold">Turnover below minimum threshold</option>
                  <option value="Incomplete documentation">Incomplete documentation</option>
                  <option value="CIBIL score not satisfactory">CIBIL score not satisfactory</option>
                  <option value="GST verification failed">GST verification failed</option>
                  <option value="Business vintage insufficient">Business vintage insufficient</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRejectModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleReject} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium" data-testid="confirm-reject-btn">Reject Application</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCreditApplications;
