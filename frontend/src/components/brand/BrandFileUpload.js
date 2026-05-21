import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Brand-side variant of FileUploadInput. Uses brand JWT token from localStorage.
 * Hits /api/cloudinary/signature with the brand bearer token (the cloudinary
 * router accepts both admin and vendor tokens; we extend to brand by piggy-
 * backing on the existing locofast_token if present, falling back to brand).
 */
const BrandFileUpload = ({ value, onChange, label, folder = "uploads/financials/credit-applications", testid = "brand-file" }) => {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("File too large (max 25 MB)"); return; }
    setBusy(true);
    try {
      // Try admin token first (if AM is uploading), then fall back to brand token
      const token = localStorage.getItem("locofast_token") || localStorage.getItem("lf_brand_token");
      const isPdf = (file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
      const resource_type = isPdf ? "auto" : "image";
      const sigRes = await fetch(`${API}/api/cloudinary/signature?resource_type=${resource_type}&folder=${encodeURIComponent(folder)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sigRes.ok) throw new Error("Couldn't get upload signature — please contact your account manager");
      const sig = await sigRes.json();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);
      const upRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resource_type}/upload`, { method: "POST", body: fd });
      const data = await upRes.json();
      if (!upRes.ok || data.error) throw new Error(data.error?.message || "Upload failed");
      onChange?.(data.secure_url);
      toast.success("File uploaded");
    } catch (e) { toast.error(e.message || "Upload failed"); }
    setBusy(false);
  };

  return (
    <div className="block" data-testid={testid}>
      {label && <p className="text-xs text-gray-600 mb-1">{label}</p>}
      {value ? (
        <div className="flex items-center gap-2 p-2 border border-gray-300 rounded-lg bg-gray-50">
          <div className="w-9 h-9 rounded bg-blue-100 text-blue-700 flex items-center justify-center"><FileText size={14} /></div>
          <a href={value} target="_blank" rel="noreferrer" className="flex-1 truncate text-xs text-blue-600 hover:underline">{value.split("/").pop()}</a>
          <button type="button" onClick={() => onChange?.("")} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"><X size={12} /></button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer?.files?.[0]); }}
          onClick={() => !busy && inputRef.current?.click()}
          className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer transition ${drag ? "border-emerald-500 bg-emerald-50" : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"} ${busy ? "opacity-50" : ""}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin text-emerald-600" /> : <Upload size={14} className="text-gray-400" />}
          <span className="text-xs text-gray-600">{busy ? "Uploading…" : "Drag & drop or click"}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
};

export default BrandFileUpload;
