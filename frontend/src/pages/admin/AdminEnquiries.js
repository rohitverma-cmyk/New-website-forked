import { useState, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getEnquiries, updateEnquiryStatus, deleteEnquiry } from "../../lib/api";

const AdminEnquiries = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const statusOptions = ["new", "contacted", "in_progress", "completed", "closed"];

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const fetchEnquiries = async () => {
    setLoading(true);
    try {
      const res = await getEnquiries();
      setEnquiries(res.data);
    } catch (err) {
      toast.error("Failed to load enquiries");
    }
    setLoading(false);
  };

  const handleStatusChange = async (enquiryId, status) => {
    try {
      await updateEnquiryStatus(enquiryId, status);
      toast.success("Status updated");
      fetchEnquiries();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (enquiryId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this enquiry?")) return;
    
    setDeleting(enquiryId);
    try {
      await deleteEnquiry(enquiryId);
      toast.success("Enquiry deleted");
      if (selectedEnquiry?.id === enquiryId) {
        setSelectedEnquiry(null);
      }
      fetchEnquiries();
    } catch (err) {
      toast.error("Failed to delete enquiry");
    }
    setDeleting(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "new":
        return "bg-blue-50 text-blue-700";
      case "contacted":
        return "bg-amber-50 text-amber-700";
      case "in_progress":
        return "bg-purple-50 text-purple-700";
      case "completed":
        return "bg-emerald-50 text-emerald-700";
      case "closed":
        return "bg-neutral-100 text-neutral-600";
      default:
        return "bg-neutral-100 text-neutral-600";
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-enquiries-page">
        <h1 className="text-3xl font-serif font-medium mb-8">Enquiries</h1>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white p-4 border border-neutral-100 animate-pulse">
                <div className="h-5 bg-neutral-200 w-1/4 mb-2" />
                <div className="h-4 bg-neutral-200 w-1/2" />
              </div>
            ))}
          </div>
        ) : enquiries.length === 0 ? (
          <div className="text-center py-20 bg-white border border-neutral-100" data-testid="no-enquiries">
            <p className="text-neutral-500">No enquiries yet</p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-100 overflow-hidden" data-testid="enquiries-table">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <th className="text-left p-4 font-medium text-sm">Contact</th>
                    <th className="text-left p-4 font-medium text-sm">Source</th>
                    <th className="text-left p-4 font-medium text-sm">Fabric</th>
                    <th className="text-left p-4 font-medium text-sm">Message</th>
                    <th className="text-left p-4 font-medium text-sm">Date</th>
                    <th className="text-left p-4 font-medium text-sm">Status</th>
                    <th className="text-right p-4 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((enquiry) => (
                    <tr
                      key={enquiry.id}
                      className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 cursor-pointer"
                      onClick={() => setSelectedEnquiry(enquiry)}
                      data-testid={`enquiry-row-${enquiry.id}`}
                    >
                      <td className="p-4">
                        <p className="font-medium">{enquiry.name}</p>
                        <p className="text-sm text-neutral-500">{enquiry.email}</p>
                        {enquiry.company && (
                          <p className="text-sm text-neutral-400">{enquiry.company}</p>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          enquiry.source === 'supplier_signup_page' ? 'bg-purple-100 text-purple-700' :
                          enquiry.source === 'rfq_page' ? 'bg-blue-100 text-blue-700' :
                          enquiry.source === 'contact_page' ? 'bg-gray-100 text-gray-700' :
                          enquiry.source === 'fabric_detail_page' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          {enquiry.source === 'supplier_signup_page' ? 'Supplier Signup' :
                           enquiry.source === 'rfq_page' ? 'RFQ' :
                           enquiry.source === 'contact_page' ? 'Contact' :
                           enquiry.source === 'fabric_detail_page' ? 'Fabric Page' :
                           enquiry.source || 'Website'}
                        </span>
                        {enquiry.enquiry_type && enquiry.enquiry_type !== 'general' && (
                          <span className={`ml-1 text-xs px-2 py-1 rounded-full font-medium ${
                            enquiry.enquiry_type === 'sample_order' ? 'bg-amber-100 text-amber-700' :
                            enquiry.enquiry_type === 'bulk_order' ? 'bg-green-100 text-green-700' :
                            enquiry.enquiry_type === 'rfq' ? 'bg-blue-100 text-blue-700' :
                            'bg-neutral-100 text-neutral-600'
                          }`}>
                            {enquiry.enquiry_type === 'sample_order' ? 'Sample' :
                             enquiry.enquiry_type === 'bulk_order' ? 'Bulk' :
                             enquiry.enquiry_type === 'rfq' ? 'RFQ' :
                             enquiry.enquiry_type === 'supplier_signup' ? 'Supplier' :
                             enquiry.enquiry_type}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-neutral-600">
                        {enquiry.fabric_name || "General Enquiry"}
                      </td>
                      <td className="p-4 max-w-xs">
                        <p className="text-neutral-600 truncate">{enquiry.message}</p>
                      </td>
                      <td className="p-4 text-neutral-500 text-sm">
                        {format(new Date(enquiry.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="p-4">
                        <select
                          value={enquiry.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(enquiry.id, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`px-3 py-1 text-sm rounded-sm border-0 ${getStatusColor(enquiry.status)}`}
                          data-testid={`status-select-${enquiry.id}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => handleDelete(enquiry.id, e)}
                          disabled={deleting === enquiry.id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete enquiry"
                          data-testid={`delete-enquiry-${enquiry.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {selectedEnquiry && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSelectedEnquiry(null)}
            data-testid="enquiry-modal"
          >
            <div
              className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-neutral-100">
                <h2 className="text-xl font-serif font-medium">Enquiry Details</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="subheading mb-1">Contact</p>
                  <p className="font-medium">{selectedEnquiry.name}</p>
                  <p className="text-neutral-600">{selectedEnquiry.email}</p>
                  {selectedEnquiry.phone && <p className="text-neutral-600">{selectedEnquiry.phone}</p>}
                  {selectedEnquiry.company && <p className="text-neutral-500">{selectedEnquiry.company}</p>}
                </div>

                {selectedEnquiry.fabric_name && (
                  <div>
                    <p className="subheading mb-1">Fabric</p>
                    <p>{selectedEnquiry.fabric_name}</p>
                  </div>
                )}

                <div>
                  <p className="subheading mb-1">Message</p>
                  <p className="text-neutral-600 whitespace-pre-wrap">{selectedEnquiry.message}</p>
                </div>

                <div>
                  <p className="subheading mb-1">Date</p>
                  <p>{format(new Date(selectedEnquiry.created_at), "PPpp")}</p>
                </div>

                <div>
                  <p className="subheading mb-1">Status</p>
                  <select
                    value={selectedEnquiry.status}
                    onChange={(e) => {
                      handleStatusChange(selectedEnquiry.id, e.target.value);
                      setSelectedEnquiry({ ...selectedEnquiry, status: e.target.value });
                    }}
                    className={`px-3 py-2 text-sm rounded-sm border-0 ${getStatusColor(selectedEnquiry.status)}`}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-neutral-100">
                <button onClick={() => setSelectedEnquiry(null)} className="btn-secondary w-full">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEnquiries;
