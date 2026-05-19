import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Vendor-side file upload helper.
 * Uses the logged-in vendor's JWT (vendor_token) to fetch a signed Cloudinary
 * URL and uploads directly from the browser. Any file type is allowed
 * (resource_type=auto on the backend side); useful for tax invoice PDFs,
 * scans, JPEGs, etc.
 */
const VendorFileUpload = ({
  value,
  onChange,
  label,
  folder = "uploads/payouts/vendor-invoices",
  accept = "*/*",
  testid = "vendor-file-upload",
  disabled = false,
}) => {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large (max 25 MB)");
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem("vendor_token") || localStorage.getItem("locofast_token");
      if (!token) {
        throw new Error("Session expired — please log in again");
      }
      const resource_type = "auto";
      const sigRes = await fetch(
        `${API}/api/cloudinary/signature?resource_type=${resource_type}&folder=${encodeURIComponent(folder)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!sigRes.ok) {
        let detail = "";
        try { detail = (await sigRes.json())?.detail || ""; } catch {}
        throw new Error(detail || `Signature error (HTTP ${sigRes.status})`);
      }
      const sig = await sigRes.json();
      if (!sig.cloud_name || !sig.signature) {
        throw new Error("Cloudinary is not configured on the server — please contact support");
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);
      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resource_type}/upload`,
        { method: "POST", body: fd }
      );
      const data = await upRes.json().catch(() => ({}));
      if (!upRes.ok || data.error) {
        throw new Error(data.error?.message || `Cloudinary rejected the upload (HTTP ${upRes.status})`);
      }
      if (!data.secure_url) {
        throw new Error("Upload completed but no URL was returned");
      }
      onChange?.({ url: data.secure_url, filename: file.name, public_id: data.public_id });
      toast.success("File uploaded");
    } catch (e) {
      console.error("[VendorFileUpload] upload failed", e);
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      // Reset the input so the same file can be re-picked after an error
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="block" data-testid={testid}>
      {label && <p className="text-xs text-gray-600 mb-1">{label}</p>}
      {value ? (
        <div className="flex items-center gap-2 p-2 border border-gray-300 rounded-lg bg-gray-50">
          <div className="w-9 h-9 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <FileText size={14} />
          </div>
          <a
            href={typeof value === "string" ? value : value.url}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-xs text-emerald-700 hover:underline"
            data-testid={`${testid}-link`}
          >
            {(typeof value === "string" ? value : value.filename || value.url || "").split("/").pop()}
          </a>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange?.(null)}
              className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"
              data-testid={`${testid}-clear`}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor={`${testid}-file-input`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!disabled && !busy) upload(e.dataTransfer?.files?.[0]);
          }}
          className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer transition select-none ${
            drag ? "border-emerald-500 bg-emerald-50" : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"
          } ${busy || disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
          data-testid={`${testid}-dropzone`}
        >
          {busy ? <Loader2 size={14} className="animate-spin text-emerald-600" /> : <Upload size={14} className="text-gray-400" />}
          <span className="text-xs text-gray-600">
            {busy ? "Uploading…" : "Drag & drop or click to upload (PDF, JPG, PNG · max 25 MB)"}
          </span>
        </label>
      )}
      {/* Native <input type="file"> wrapped by the <label> above. Using
          htmlFor means the click goes through the browser's accessible
          file-picker path — no JS focus chains, no parent event
          propagation issues. */}
      <input
        ref={inputRef}
        id={`${testid}-file-input`}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
        // stopPropagation guards against parent modal backdrop click
        // handlers firing while the file picker is open.
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default VendorFileUpload;
