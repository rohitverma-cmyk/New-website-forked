/**
 * Database Backup — one-click full DB download for the super admin.
 *
 * No tech skills needed: see how big the DB is, click Download, get a
 * zip file. Every download is audit-logged on the server.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Download, Database, Loader2, ShieldCheck, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function AdminDatabaseBackup() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const token = localStorage.getItem("locofast_token");

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/db/export/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load summary");
      const data = await res.json();
      setCollections(data.collections || []);
    } catch (e) {
      toast.error(e.message || "Could not load summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPreview(); /* eslint-disable-next-line */ }, []);

  const handleDownload = async () => {
    setDownloading(true);
    const toastId = toast.loading("Preparing your backup… this may take a moment.");
    try {
      const res = await fetch(`${API}/api/admin/db/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const docs = res.headers.get("x-export-docs") || "";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `locofast-database-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded · ${docs ? `${Number(docs).toLocaleString()} records` : "ready"}`, { id: toastId });
    } catch (e) {
      toast.error(e.message || "Download failed", { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const totalDocs = collections.reduce((sum, c) => sum + (c.estimated_documents > 0 ? c.estimated_documents : 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-5xl" data-testid="admin-db-backup-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">
            Database Backup
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Download a complete snapshot of all platform data — customers, orders, invoices, vendors, everything.
          </p>
        </div>

        {/* Big download card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-8">
          <div className="flex items-start gap-5">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
              <Database size={28} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Full Database Backup</h2>
              <p className="text-sm text-gray-600 mt-1">
                {loading
                  ? "Calculating size…"
                  : <>You'll get a <strong>.zip file</strong> containing <strong>{totalDocs.toLocaleString()}</strong> records across <strong>{collections.length}</strong> tables.</>}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || loading}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  data-testid="download-backup-btn"
                >
                  {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {downloading ? "Preparing backup…" : "Download Backup (.zip)"}
                </button>
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  data-testid="refresh-summary-btn"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Helper info */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
              <Info size={16} className="text-blue-600" /> What's inside?
            </div>
            <ul className="mt-3 text-sm text-gray-600 space-y-1.5 list-disc pl-5">
              <li>Every customer, order, invoice, vendor, brand, and credit record.</li>
              <li>One file per table — open in Excel, Google Sheets, or any database tool.</li>
              <li>A summary file <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">_manifest.json</code> listing all tables and counts.</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
              <ShieldCheck size={16} className="text-emerald-600" /> Security
            </div>
            <ul className="mt-3 text-sm text-gray-600 space-y-1.5 list-disc pl-5">
              <li>Only admin users can download.</li>
              <li>Every download is logged with your name, time, and IP address.</li>
              <li>Store the file in a safe location — it contains business data.</li>
            </ul>
          </div>
        </div>

        {/* Table summary */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">What will be included</h3>
            <span className="text-xs text-gray-500">{collections.length} tables · {totalDocs.toLocaleString()} records</span>
          </div>
          {loading ? (
            <div className="p-10 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Table</th>
                    <th className="px-5 py-2.5 text-right">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {collections.map((c) => (
                    <tr key={c.name} className="hover:bg-gray-50">
                      <td className="px-5 py-2 text-gray-800 font-mono text-xs">{c.name}</td>
                      <td className="px-5 py-2 text-right text-gray-700">
                        {c.estimated_documents >= 0 ? c.estimated_documents.toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
