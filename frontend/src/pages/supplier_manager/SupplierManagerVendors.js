/**
 * Supplier Manager — Vendor Picker
 *
 * After SM login, the SM sees a list of vendors mapped to them. Clicking
 * a vendor mints a vendor JWT (via /api/supplier-manager/impersonate) and
 * stores it as the regular vendor_token + vendor — so every subsequent
 * vendor screen works unchanged. The SM banner (top of VendorLayout)
 * surfaces an "Exit acting-as" pill.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Building2, ChevronRight, Loader2, LogOut, Users, MapPin } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const SupplierManagerVendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const sm = JSON.parse(localStorage.getItem("lf_sm") || "{}");
  const smToken = localStorage.getItem("lf_sm_token");

  useEffect(() => {
    if (!smToken) {
      navigate("/vendor/login");
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${API}/api/supplier-manager/vendors`, {
          headers: { Authorization: `Bearer ${smToken}` },
        });
        setVendors(res.data.vendors || []);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Failed to load vendors");
        if (e.response?.status === 401) {
          localStorage.removeItem("lf_sm_token");
          localStorage.removeItem("lf_sm");
          navigate("/vendor/login");
        }
      }
      setLoading(false);
    })();
  }, [smToken, navigate]);

  const startActingAs = async (seller_id) => {
    setActingId(seller_id);
    try {
      const res = await axios.post(
        `${API}/api/supplier-manager/impersonate/${seller_id}`,
        {},
        { headers: { Authorization: `Bearer ${smToken}` } }
      );
      const { vendor_token, vendor, acting_as_sm } = res.data;
      // Store vendor JWT + vendor (same shape as a regular vendor login)
      localStorage.setItem("vendor_token", vendor_token);
      localStorage.setItem("vendor_data", JSON.stringify(vendor));
      localStorage.setItem("lf_acting_as_sm", JSON.stringify(acting_as_sm));
      toast.success(`Acting as ${vendor.company_name}`);
      window.location.href = "/vendor";
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't switch vendor");
      setActingId(null);
    }
  };

  const signOut = () => {
    localStorage.removeItem("lf_sm_token");
    localStorage.removeItem("lf_sm");
    localStorage.removeItem("lf_sm_vendors");
    localStorage.removeItem("lf_acting_as_sm");
    localStorage.removeItem("vendor_token");
    localStorage.removeItem("vendor_data");
    navigate("/vendor/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold uppercase tracking-wide">
              <Users size={12} /> Supplier Manager
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mt-2" data-testid="sm-greeting">
              Hi, {sm?.name || "Supplier Manager"}
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Choose a vendor to act on their behalf.
            </p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
            data-testid="sm-signout"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin mx-auto text-slate-400" size={32} />
            <p className="text-slate-500 mt-2 text-sm">Loading mapped vendors…</p>
          </div>
        ) : vendors.length === 0 ? (
          <div className="bg-white border border-amber-200 rounded-xl p-8 text-center" data-testid="sm-empty">
            <Building2 className="mx-auto text-amber-500" size={40} />
            <p className="mt-4 text-slate-800 font-medium">No vendors mapped to your account yet</p>
            <p className="text-slate-500 text-sm mt-1">Ask Locofast Admin to map vendors to you on the Supplier Managers page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="sm-vendors-grid">
            {vendors.map((v) => (
              <button
                key={v.id}
                onClick={() => startActingAs(v.id)}
                disabled={actingId === v.id}
                className="text-left bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-md transition rounded-xl p-5 flex items-center justify-between gap-3 disabled:opacity-60"
                data-testid={`sm-vendor-${v.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="text-emerald-700" size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{v.company_name || v.name}</p>
                    <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                      <MapPin size={10} /> {v.city || "—"}{v.state ? `, ${v.state}` : ""}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{v.seller_code || v.contact_email}</p>
                  </div>
                </div>
                {actingId === v.id ? (
                  <Loader2 className="animate-spin text-emerald-600 flex-shrink-0" size={20} />
                ) : (
                  <ChevronRight className="text-slate-400 flex-shrink-0" size={20} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierManagerVendors;
