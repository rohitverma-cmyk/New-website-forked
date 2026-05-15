/**
 * SavedAddressPicker — Horizontal chip list of the customer's past
 * shipping addresses (derived from their order history server-side).
 * Tapping a chip emits the address dict so the parent checkout form
 * can fill its fields.
 *
 * Empty state: renders nothing (no chrome). The component fades in only
 * after the API returns at least one row.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { MapPin, CheckCircle2 } from "lucide-react";
import { useCustomerAuth } from "../context/CustomerAuthContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function SavedAddressPicker({ onPick, dense = false }) {
  const { token, isLoggedIn } = useCustomerAuth();
  const [addresses, setAddresses] = useState([]);
  const [pickedKey, setPickedKey] = useState(null);

  useEffect(() => {
    if (!isLoggedIn || !token) return;
    let alive = true;
    axios
      .get(`${API_URL}/api/customer/saved-addresses`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (alive) setAddresses(Array.isArray(r.data) ? r.data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn, token]);

  if (!addresses.length) return null;

  const handlePick = (a, idx) => {
    setPickedKey(idx);
    onPick && onPick(a);
  };

  return (
    <div style={{ marginBottom: dense ? 12 : 18 }} data-testid="saved-address-picker">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <MapPin size={dense ? 12 : 14} color="#2563EB" />
        <span style={{ fontSize: dense ? 11 : 12, fontWeight: 700, color: "#4A5468", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Ship to a saved address
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginLeft: -2, marginRight: -2, padding: "0 2px 4px" }}>
        {addresses.map((a, idx) => {
          const isPicked = pickedKey === idx;
          return (
            <button
              key={`${a.address}-${a.pincode}-${idx}`}
              type="button"
              onClick={() => handlePick(a, idx)}
              data-testid={`saved-address-chip-${idx}`}
              style={{
                flex: "0 0 auto",
                maxWidth: 240,
                minWidth: 200,
                textAlign: "left",
                padding: dense ? "10px 12px" : "12px 14px",
                borderRadius: 12,
                border: isPicked ? "2px solid #2563EB" : "1px solid #D6E0EE",
                background: isPicked ? "#EFF6FF" : "#fff",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                position: "relative",
              }}
            >
              {isPicked && (
                <CheckCircle2 size={14} color="#2563EB" style={{ position: "absolute", top: 8, right: 8 }} />
              )}
              <span style={{ fontSize: dense ? 12 : 13, fontWeight: 700, color: "#0F1B2D", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: isPicked ? 20 : 0 }}>
                {a.company || a.name || "Saved address"}
              </span>
              <span style={{ fontSize: dense ? 11 : 12, color: "#4A5468", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {a.address}
              </span>
              <span style={{ fontSize: 11, color: "#8A93A6" }}>
                {[a.city, a.state, a.pincode].filter(Boolean).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
