/**
 * CreateCatalogueModal — agent picks a title/intro/client name, optionally
 * uploads a hero image + client logo, then POSTs to /api/agent/catalogues.
 *
 * On success it shows the share URL with copy/open buttons.
 */
import { useState } from "react";
import { X, Copy, Check, Sparkles, Image as ImageIcon, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const FRONTEND_BASE = window.location.origin;

export default function CreateCatalogueModal({ open, onClose, fabricIds = [], agentEmail = "" }) {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientLogoUrl, setClientLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(null); // 'logo' | 'hero' | null

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setIntro("");
    setClientName("");
    setClientLogoUrl("");
    setHeroImageUrl("");
    setCreated(null);
    setCopied(false);
  };

  const close = () => { reset(); onClose(); };

  const uploadImage = async (file, slot) => {
    if (!file) return;
    setUploading(slot);
    try {
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("lf_agent_token");
      const res = await fetch(`${apiUrl}/api/cloudinary/upload`, {
        method: "POST", body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.secure_url || data.url;
      if (slot === "logo") setClientLogoUrl(url);
      else setHeroImageUrl(url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error("Couldn't upload image: " + (e.message || ""));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (fabricIds.length === 0) {
      toast.error("Add at least 1 fabric");
      return;
    }
    setSaving(true);
    try {
      const apiUrl = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem("lf_agent_token");
      const res = await fetch(`${apiUrl}/api/agent/catalogues`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim() || (clientName ? `For ${clientName}` : "Curated Catalogue"),
          intro: intro.trim(),
          client_name: clientName.trim(),
          client_logo_url: clientLogoUrl.trim(),
          hero_image_url: heroImageUrl.trim(),
          fabric_ids: fabricIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreated(data);
    } catch (e) {
      toast.error("Couldn't create catalogue: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = created ? `${FRONTEND_BASE}/c/${created.slug}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="catalogue-modal"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 text-white relative rounded-t-2xl">
          <button onClick={close} className="absolute top-4 right-4 text-white/70 hover:text-white" data-testid="catalogue-modal-close">
            <X size={18} />
          </button>
          <div className="flex items-start gap-2.5">
            <div className="mt-1 p-1.5 rounded-lg bg-white/20"><Sparkles size={14} /></div>
            <div>
              <h3 className="text-lg font-bold">Create a shareable catalogue</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                {created ? "Catalogue is live — share the link with your client." : `Bundle ${fabricIds.length} fabric${fabricIds.length === 1 ? "" : "s"} into a polished, watermarked page.`}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-sm">
          {!created ? (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Catalogue title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={clientName ? `For ${clientName}` : "e.g. Summer 26 — Knits Edit"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                  data-testid="catalogue-title"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Prepared for (client name)</label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. ACME Apparel Pvt Ltd"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                  data-testid="catalogue-client-name"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Intro paragraph (optional)</label>
                <textarea
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  rows={3}
                  placeholder="A short note explaining what's curated and why — your client sees this above the fabrics."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm resize-none"
                  data-testid="catalogue-intro"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ImageUpload
                  label="Client logo"
                  value={clientLogoUrl}
                  setValue={setClientLogoUrl}
                  onUpload={(f) => uploadImage(f, "logo")}
                  uploading={uploading === "logo"}
                  testId="catalogue-client-logo"
                />
                <ImageUpload
                  label="Cover hero image"
                  value={heroImageUrl}
                  setValue={setHeroImageUrl}
                  onUpload={(f) => uploadImage(f, "hero")}
                  uploading={uploading === "hero"}
                  testId="catalogue-hero-image"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-semibold mb-1">📦 What gets included</p>
                <p className="text-blue-700 leading-relaxed">
                  Each fabric shows its photo, code, composition, GSM/oz, width, MOQ and starting price. Big Locofast watermarks across the page and a "Curated by you" footer.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={close} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || fabricIds.length === 0}
                  className="flex-1 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="catalogue-save-btn"
                >
                  {saving ? <><Loader2 size={14} className="animate-spin" />Creating…</> : <>Create & get link</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-900">
                <p className="text-sm font-semibold">✓ Catalogue is live</p>
                <p className="text-xs text-emerald-700 mt-1">Anyone with this link can view the {fabricIds.length} fabric{fabricIds.length === 1 ? "" : "s"}. The page is watermarked and stamped with your contact details.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Share URL</label>
                <div className="flex items-stretch gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-50 focus:outline-none"
                    onClick={(e) => e.target.select()}
                    data-testid="catalogue-share-url"
                  />
                  <button onClick={copy} className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-700" data-testid="catalogue-copy-btn">
                    {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                  data-testid="catalogue-open-btn"
                >
                  <ExternalLink size={13} />Preview
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hi! Sharing a curated fabric catalogue from Locofast — ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5"
                  data-testid="catalogue-whatsapp-btn"
                >
                  Share on WhatsApp
                </a>
              </div>

              <button onClick={close} className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ImageUpload = ({ label, value, setValue, onUpload, uploading, testId }) => (
  <div>
    <label className="text-xs font-semibold text-gray-700 block mb-1">{label} <span className="text-gray-400 font-normal">· optional</span></label>
    {value ? (
      <div className="relative h-20 border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
        <img src={value} alt="" className="w-full h-full object-contain" />
        <button onClick={() => setValue("")} className="absolute top-1 right-1 bg-white/90 text-gray-700 rounded-full p-1 hover:bg-white shadow">
          <X size={11} />
        </button>
      </div>
    ) : (
      <label className="h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#2563EB] hover:bg-blue-50/30 text-xs text-gray-500" data-testid={testId}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onUpload(e.target.files?.[0])}
          className="hidden"
        />
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <><ImageIcon size={12} className="mr-1" /> Upload</>}
      </label>
    )}
  </div>
);
