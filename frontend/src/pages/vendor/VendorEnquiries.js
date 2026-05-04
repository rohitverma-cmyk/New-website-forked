import { useState, useEffect } from "react";
import { MessageSquare, Search, Loader2, ExternalLink } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import { getVendorEnquiries } from "../../lib/api";

const VendorEnquiries = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const fetchEnquiries = async () => {
    try {
      const res = await getVendorEnquiries();
      setEnquiries(res.data);
    } catch (err) {
      console.error("Failed to load enquiries", err);
    }
    setLoading(false);
  };

  const filteredEnquiries = enquiries.filter((e) =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase()) ||
    e.fabric_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <VendorLayout>
      <div className="p-8" data-testid="vendor-enquiries">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Enquiries</h1>
            <p className="text-gray-500 mt-1">View enquiries for your fabrics</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email or fabric..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Enquiries List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          </div>
        ) : filteredEnquiries.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {search ? "No enquiries match your search" : "No enquiries yet"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Enquiries will appear here when customers submit them
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fabric</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company / GST</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEnquiries.map((enquiry) => (
                  <tr key={enquiry.id || enquiry._id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{enquiry.name}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-900">{enquiry.email}</p>
                      <p className="text-sm text-gray-500">{enquiry.phone}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-900">{enquiry.fabric_name || "-"}</p>
                      <p className="text-sm text-gray-500">{enquiry.fabric_code || ""}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-900">{enquiry.company || "-"}</p>
                      <p className="text-sm text-gray-500">{enquiry.gst_number || ""}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {formatDate(enquiry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorEnquiries;
