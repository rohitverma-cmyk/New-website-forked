import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import api from "../../lib/api";

/**
 * Drag-drop / click-to-upload widget that returns a Cloudinary URL via onChange.
 *
 * Props:
 *   value     — current URL string (we display chip + Replace/Remove actions)
 *   onChange  — fn(newUrl)
 *   label     — field label
 *   accept    — input accept attr (default any common doc + image)
 *   folder    — Cloudinary folder; must start with one of the ALLOWED_FOLDERS prefixes
 *   testid    — base data-testid
 */
const FileUploadInput = ({
  value,
  onChange,
  label,
  accept = ".pdf,.jpg,.jpeg,.png,.webp,.heic",
  folder = "uploads/financials",
  testid = "file-upload",
}) => {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large (max 25 MB)"); return;
    }
    setBusy(true);
    try {
      // PDFs/docs need resource_type=raw or auto so Cloudinary keeps the original
      const isPdf = (file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
      const resource_type = isPdf ? "auto" : "image";
      const sigRes = await api.get("/cloudinary/signature", { params: { resource_type, folder } });
      const sig = sigRes.data;
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
      const data = await upRes.json();
      if (!upRes.ok || data.error) throw new Error(data.error?.message || "Upload failed");
      onChange?.(data.secure_url);
      toast.success("File uploaded");
    } catch (e) { toast.error(e.message || "Upload failed"); }
    setBusy(false);
  };

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) upload(f);
  };

  const isImage = value && /\.(jpg|jpeg|png|webp|heic)(\?|$)/i.test(value);
  return (
    <label className="block" data-testid={testid}>
      {label && <span className="text-xs text-gray-600 mb-1 block">{label}</span>}
      {value ? (
        <div className="flex items-center gap-2 p-2 border border-gray-300 rounded-lg bg-gray-50">
          {isImage ? (
            <img src={value} alt="upload" className="w-10 h-10 object-cover rounded" />
          ) : (
            <div className="w-10 h-10 rounded bg-blue-100 text-blue-700 flex items-center justify-center"><FileText size={16} /></div>
          )}
          <a href={value} target="_blank" rel="noreferrer" className="flex-1 truncate text-xs text-blue-600 hover:underline" data-testid={`${testid}-link`}>{value.split("/").pop()}</a>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded" disabled={busy} data-testid={`${testid}-replace`}>Replace</button>
          <button type="button" onClick={() => onChange?.("")} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded" data-testid={`${testid}-remove`}><X size={12} /></button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition ${drag ? "border-emerald-500 bg-emerald-50" : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"} ${busy ? "opacity-50 cursor-wait" : ""}`}
          data-testid={`${testid}-dropzone`}
        >
          {busy ? <Loader2 size={14} className="animate-spin text-emerald-600" /> : <Upload size={14} className="text-gray-400" />}
          <span className="text-xs text-gray-600">{busy ? "Uploading…" : "Drag & drop or click to upload"}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
        data-testid={`${testid}-input`}
      />
    </label>
  );
};

export default FileUploadInput;
