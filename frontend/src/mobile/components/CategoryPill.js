import { useNavigate } from "react-router-dom";

// Maps category names to a gradient + emoji for visual punch.
const CAT_VISUAL = {
  "Denim": { gradient: "linear-gradient(135deg, #1e3a8a, #1e40af, #2563eb)", emoji: "🧵", live: true },
  "Cotton": { gradient: "linear-gradient(135deg, #FFF6EE, #FFE3CE)", emoji: "🌾", ink: "var(--m-ink)", live: true },
  "Cotton Fabrics": { gradient: "linear-gradient(135deg, #FFF6EE, #FFE3CE)", emoji: "🌾", ink: "var(--m-ink)", live: true },
  "Viscose": { gradient: "linear-gradient(135deg, #fce7f3, #fbcfe8)", emoji: "✨", ink: "var(--m-ink)", live: true },
  "Polyester Fabrics": { gradient: "linear-gradient(135deg, #1e293b, #334155)", emoji: "✨" },
  "Sustainable Fabrics": { gradient: "linear-gradient(135deg, #15803d, #16a34a)", emoji: "🌱", live: true },
  "Blended Fabrics": { gradient: "linear-gradient(135deg, #6b7280, #9ca3af)", emoji: "🎨" },
  "Linen": { gradient: "linear-gradient(135deg, #fef3c7, #fde68a)", emoji: "🌿", ink: "var(--m-ink)" },
};

export default function CategoryPill({ category, comingSoon = false, count }) {
  const navigate = useNavigate();
  const v = CAT_VISUAL[category.name] || { gradient: "linear-gradient(135deg, #FF7A3D, #E5631E)", emoji: "🧵" };
  const textColor = v.ink || "#fff";

  const onClick = () => {
    if (comingSoon) return;
    navigate(`/m/catalog?category=${encodeURIComponent(category.id)}`);
  };

  return (
    <button
      onClick={onClick}
      style={{
        width: 150, height: 110, flex: "0 0 auto", padding: 14,
        borderRadius: "var(--m-radius)", border: "none", textAlign: "left",
        background: v.gradient, color: textColor, cursor: comingSoon ? "default" : "pointer",
        position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        boxShadow: "var(--m-shadow-sm)",
        opacity: comingSoon ? 0.65 : 1,
      }}
    >
      <div style={{
        position: "absolute", top: 8, right: 10,
        fontSize: 11, fontWeight: 800, letterSpacing: "0.05em",
        padding: "3px 8px", borderRadius: 999,
        background: comingSoon ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.25)",
        color: comingSoon ? textColor : textColor,
        backdropFilter: "blur(4px)",
      }}>
        {comingSoon ? "SOON" : (v.live ? "● LIVE" : "● LIVE")}
      </div>
      <div style={{ fontSize: 28, lineHeight: 1 }}>{v.emoji}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>{category.name}</div>
        {count != null && (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{count} SKUs</div>
        )}
      </div>
    </button>
  );
}
