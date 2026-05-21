import { useEffect, useState, useRef } from "react";

// Bottom sheet primitive — mounts portal-free, focus-locked while open.
export default function BottomSheet({ open, onClose, title, children, footer, height = "auto" }) {
  const [render, setRender] = useState(open);
  const [animOpen, setAnimOpen] = useState(false);
  const scrollY = useRef(0);

  useEffect(() => {
    if (open) {
      scrollY.current = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY.current}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      setRender(true);
      requestAnimationFrame(() => setAnimOpen(true));
    } else if (render) {
      setAnimOpen(false);
      const y = scrollY.current;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, y);
      const t = setTimeout(() => setRender(false), 280);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!render) return null;

  return (
    <>
      <div className={"m-sheet-backdrop" + (animOpen ? " open" : "")} onClick={onClose} />
      <div
        className={"m-sheet" + (animOpen ? " open" : "")}
        role="dialog"
        aria-modal="true"
        style={height === "auto" ? undefined : { maxHeight: height }}
      >
        <div className="m-sheet-handle" />
        {title && (
          <div className="m-sheet-head">
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--m-ink)" }}>{title}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--m-blue)", fontWeight: 600, fontSize: 14, padding: "4px 8px", cursor: "pointer" }}>Close</button>
          </div>
        )}
        <div className="m-sheet-body">{children}</div>
        {footer && <div className="m-sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
