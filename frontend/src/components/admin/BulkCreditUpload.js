// Drag-and-drop bulk credit uploader. Accepts CSV / XLS / XLSX, auto-detects
// header columns, validates rows, and shows a preview table before commit.
//
// Header aliases (case-insensitive, trimmed):
//   email       — required. Must contain "@".
//   credit_limit — required. Must be a non-negative number.
//   name        — optional, contact name.
//   company     — optional, brand / company name.
//   lender      — optional. e.g. "HDFC Bank", "Stride", "Direct".
//
// Two modes:
//   replace — rebuild wallet from row (balance = credit_limit). Default.
//   topup   — ADD uploaded amount to existing limit AND balance. Preserves used credit.
//
// We keep a "Paste CSV" textarea fallback for power users.

import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Upload, FileText, X, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { bulkUploadCreditWallets } from "../../lib/api";

const HEADER_ALIASES = {
  email: ["email", "e-mail", "user_email", "buyer_email"],
  name: ["name", "contact", "contact_name", "person"],
  company: ["company", "brand", "company_name", "brand_name"],
  credit_limit: ["credit_limit", "credit", "limit", "amount", "credit_amount", "credit limit"],
  lender: ["lender", "lender_name", "bank", "financier"],
};

const TEMPLATE_CSV =
  "email,name,company,credit_limit,lender\n" +
  "buyer@brand.com,Raj Kumar,Brand Co,500000,HDFC Bank\n" +
  "sourcing@fashion.in,Priya Shah,Fashion Inc,300000,ICICI Bank\n";

// Map a raw header row to canonical field names. Returns { idxMap, missing }.
const mapHeaders = (rawHeaders) => {
  const lower = rawHeaders.map((h) => String(h || "").trim().toLowerCase());
  const idxMap = {};
  Object.entries(HEADER_ALIASES).forEach(([canon, aliases]) => {
    const idx = lower.findIndex((h) => aliases.includes(h));
    if (idx !== -1) idxMap[canon] = idx;
  });
  const missing = ["email", "credit_limit"].filter((k) => !(k in idxMap));
  return { idxMap, missing };
};

// Validate a single mapped row. Returns { ok, errors:[..], wallet }.
const validateRow = (row) => {
  const errors = [];
  const email = String(row.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) errors.push("invalid email");
  const rawLimit = row.credit_limit;
  const limit = typeof rawLimit === "number" ? rawLimit : parseFloat(String(rawLimit || "").replace(/[,₹\s]/g, ""));
  if (Number.isNaN(limit)) errors.push("credit_limit not a number");
  else if (limit < 0) errors.push("credit_limit < 0");
  return {
    ok: errors.length === 0,
    errors,
    wallet: {
      email,
      name: String(row.name || "").trim(),
      company: String(row.company || "").trim(),
      credit_limit: Number.isNaN(limit) ? 0 : limit,
      lender: String(row.lender || "").trim(),
    },
  };
};

// Parse a CSV string into [{header...}] rows. Handles quoted commas.
const parseCsvText = (text) => {
  // SheetJS handles quoted CSV correctly — reuse it instead of writing our own.
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
};

// Parse an ArrayBuffer (xlsx/xls) into rows-of-arrays.
const parseWorkbook = (buf) => {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
};

const BulkCreditUpload = ({ open, onClose, onSuccess, currentWallets = [] }) => {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]); // post-parse, no header
  const [headerMap, setHeaderMap] = useState({}); // canon -> col index
  const [headerMissing, setHeaderMissing] = useState([]);
  const [pasteText, setPasteText] = useState("");
  const [mode, setMode] = useState("replace");
  const [submitting, setSubmitting] = useState(false);

  // Validated preview rows derived from rawRows + headerMap.
  const preview = useMemo(() => {
    if (!rawRows.length || headerMissing.length) return { rows: [], validCount: 0, errorCount: 0 };
    const rows = rawRows.map((r, i) => {
      const obj = {};
      Object.entries(headerMap).forEach(([canon, colIdx]) => {
        obj[canon] = r[colIdx];
      });
      const v = validateRow(obj);
      return { rowNum: i + 2, ...v }; // +2 because row 1 is header
    });
    return {
      rows,
      validCount: rows.filter((r) => r.ok).length,
      errorCount: rows.filter((r) => !r.ok).length,
    };
  }, [rawRows, headerMap, headerMissing]);

  const reset = () => {
    setFileName("");
    setRawRows([]);
    setHeaderMap({});
    setHeaderMissing([]);
    setPasteText("");
  };

  const ingestRows = (rows, sourceName) => {
    const cleaned = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c || "").trim() !== ""));
    if (cleaned.length < 2) {
      toast.error("File needs a header row + at least one data row");
      return;
    }
    const [header, ...data] = cleaned;
    const { idxMap, missing } = mapHeaders(header);
    setHeaderMap(idxMap);
    setHeaderMissing(missing);
    setRawRows(data);
    setFileName(sourceName);
    if (missing.length) {
      toast.error(`Missing required columns: ${missing.join(", ")}`);
    } else {
      toast.success(`Parsed ${data.length} rows`);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "csv" || file.type === "text/csv") {
        const text = await file.text();
        ingestRows(parseCsvText(text), file.name);
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        ingestRows(parseWorkbook(buf), file.name);
      } else {
        toast.error("Only .csv, .xlsx, .xls supported");
      }
    } catch (e) {
      toast.error(`Could not parse file: ${e.message || "unknown error"}`);
    }
  };

  const handlePasteParse = () => {
    if (!pasteText.trim()) return;
    try {
      ingestRows(parseCsvText(pasteText), "(pasted text)");
    } catch (e) {
      toast.error(`Parse failed: ${e.message}`);
    }
  };

  const handleSubmit = async () => {
    const validWallets = preview.rows.filter((r) => r.ok).map((r) => r.wallet);
    if (!validWallets.length) {
      toast.error("No valid rows to upload");
      return;
    }
    setSubmitting(true);
    try {
      const res = await bulkUploadCreditWallets(validWallets, mode);
      const { created = 0, updated = 0, skipped = [] } = res.data;
      const skipNote = skipped.length ? `, ${skipped.length} skipped` : "";
      toast.success(`Bulk upload done: ${created} created, ${updated} updated${skipNote}`);
      onSuccess?.();
      reset();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    }
    setSubmitting(false);
  };

  const downloadCsv = (filename, text) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    if (!currentWallets.length) {
      toast.error("No wallets to export");
      return;
    }
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "email,name,company,credit_limit,balance,lender\n";
    const body = currentWallets
      .map((w) =>
        [w.email, w.name, w.company, w.credit_limit ?? 0, w.balance ?? 0, w.lender]
          .map(escape)
          .join(",")
      )
      .join("\n");
    downloadCsv(`locofast-credit-wallets-${new Date().toISOString().slice(0, 10)}.csv`, header + body);
  };

  if (!open) return null;

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="bulk-upload-modal"
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Bulk Upload Credit Wallets</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload a CSV or Excel file. We auto-detect column headers.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-gray-400 hover:text-gray-700" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer ${
                  mode === "replace" ? "border-blue-500 bg-blue-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="bulk-mode"
                    value="replace"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    data-testid="bulk-mode-replace"
                  />
                  <span className="text-sm font-medium">Replace</span>
                </div>
                <p className="text-xs text-gray-500 ml-5">
                  Overwrite existing limits; balance reset to new limit.
                </p>
              </label>
              <label
                className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer ${
                  mode === "topup" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="bulk-mode"
                    value="topup"
                    checked={mode === "topup"}
                    onChange={() => setMode("topup")}
                    data-testid="bulk-mode-topup"
                  />
                  <span className="text-sm font-medium">Top-up</span>
                </div>
                <p className="text-xs text-gray-500 ml-5">
                  Add uploaded amount to existing limit & balance (preserves used credit).
                </p>
              </label>
            </div>
          </div>

          {/* Action row: template + export */}
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <button
              onClick={() => downloadCsv("locofast-credit-template.csv", TEMPLATE_CSV)}
              className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
              data-testid="download-template-btn"
            >
              <Download size={14} /> Download CSV template
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={handleExportCurrent}
              disabled={!currentWallets.length}
              className="inline-flex items-center gap-1.5 text-gray-700 hover:underline disabled:text-gray-300 disabled:no-underline"
              data-testid="export-current-btn"
            >
              <Download size={14} /> Export current ({currentWallets.length})
            </button>
            <span className="ml-auto text-xs text-gray-500">
              Required: <code className="bg-gray-100 px-1 rounded">email</code>{" "}
              <code className="bg-gray-100 px-1 rounded">credit_limit</code>
            </span>
          </div>

          {/* Drop zone */}
          {!rawRows.length && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
              }`}
              data-testid="bulk-upload-dropzone"
            >
              <Upload size={32} className="mx-auto text-gray-400 mb-3" />
              <p className="font-medium text-gray-800">Drop CSV / XLSX here, or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">First row must contain column headers</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
                data-testid="bulk-upload-file-input"
              />
            </div>
          )}

          {/* File loaded — preview */}
          {rawRows.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-gray-500" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-gray-500">· {rawRows.length} rows</span>
                </div>
                <button
                  onClick={reset}
                  className="text-xs text-gray-500 hover:text-gray-800"
                  data-testid="bulk-upload-reset"
                >
                  Choose another file
                </button>
              </div>

              {headerMissing.length > 0 ? (
                <div className="p-4 bg-red-50 text-red-700 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5" />
                  <div>
                    Missing required columns: <strong>{headerMissing.join(", ")}</strong>.
                    <br />
                    <span className="text-xs text-red-600">
                      Detected headers map: {Object.keys(headerMap).join(", ") || "none"}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 bg-white text-xs text-gray-600 flex items-center gap-3 border-b">
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={14} /> {preview.validCount} valid
                    </span>
                    {preview.errorCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertCircle size={14} /> {preview.errorCount} with errors (will be skipped)
                      </span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto" data-testid="bulk-upload-preview">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10">
                            #
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Email
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Company
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Limit
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Lender
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.rows.slice(0, 200).map((r) => (
                          <tr
                            key={r.rowNum}
                            className={r.ok ? "" : "bg-red-50"}
                            data-testid={`preview-row-${r.rowNum}`}
                          >
                            <td className="px-3 py-2 text-gray-400 text-xs">{r.rowNum}</td>
                            <td className="px-3 py-2 text-gray-700">{r.wallet.email || "—"}</td>
                            <td className="px-3 py-2 text-gray-600">{r.wallet.company || "—"}</td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              ₹{(r.wallet.credit_limit || 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-gray-500">{r.wallet.lender || "—"}</td>
                            <td className="px-3 py-2">
                              {r.ok ? (
                                <span className="text-xs text-emerald-700">OK</span>
                              ) : (
                                <span className="text-xs text-red-700">{r.errors.join(", ")}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {preview.rows.length > 200 && (
                          <tr>
                            <td colSpan="6" className="px-3 py-2 text-center text-xs text-gray-500">
                              … and {preview.rows.length - 200} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Paste fallback */}
          <details className="bg-gray-50 rounded-lg border border-gray-200">
            <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
              Or paste CSV text
            </summary>
            <div className="p-4 space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder={TEMPLATE_CSV}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono"
                data-testid="bulk-upload-textarea"
              />
              <button
                onClick={handlePasteParse}
                disabled={!pasteText.trim()}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
                data-testid="bulk-upload-paste-parse"
              >
                Parse pasted CSV
              </button>
            </div>
          </details>
        </div>

        <div className="p-6 border-t flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={() => {
              reset();
              onClose?.();
            }}
            className="px-4 py-2.5 border border-gray-200 bg-white rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !preview.validCount}
            className="px-5 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="bulk-upload-submit"
          >
            <Upload size={16} />
            {submitting ? "Uploading…" : `Upload ${preview.validCount || 0} wallet${preview.validCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkCreditUpload;
