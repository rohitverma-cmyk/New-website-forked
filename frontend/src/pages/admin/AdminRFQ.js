import { useState, useEffect } from "react";
import { Eye, Filter, Phone, Mail, Globe, FileText, CheckCircle, Clock, XCircle } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminRFQ = () => {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRfq, setSelectedRfq] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchRFQs();
  }, [filterCategory, filterStatus]);

  const fetchRFQs = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/rfq/list?limit=100`;
      if (filterCategory !== "all") url += `&category=${filterCategory}`;
      if (filterStatus !== "all") url += `&status=${filterStatus}`;
      
      const response = await fetch(url);
      const data = await response.json();
      setRfqs(data.rfqs || []);
    } catch (err) {
      toast.error("Failed to load RFQs");
    }
    setLoading(false);
  };

  const updateStatus = async (rfqId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/api/rfq/${rfqId}/status?status=${newStatus}`, {
        method: "PUT"
      });
      if (response.ok) {
        toast.success("Status updated");
        fetchRFQs();
        if (selectedRfq?.id === rfqId) {
          setSelectedRfq({ ...selectedRfq, status: newStatus });
        }
      }
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const getCategoryBadge = (category) => {
    const colors = {
      cotton: "bg-green-100 text-green-800",
      knits: "bg-purple-100 text-purple-800",
      denim: "bg-blue-100 text-blue-800",
      viscose: "bg-amber-100 text-amber-800"
    };
    return (
      <Badge className={`${colors[category] || "bg-gray-100 text-gray-800"} font-medium`}>
        {category?.toUpperCase()}
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      new: { bg: "bg-blue-100 text-blue-800", icon: Clock },
      contacted: { bg: "bg-yellow-100 text-yellow-800", icon: Phone },
      quoted: { bg: "bg-purple-100 text-purple-800", icon: FileText },
      won: { bg: "bg-green-100 text-green-800", icon: CheckCircle },
      lost: { bg: "bg-red-100 text-red-800", icon: XCircle },
      closed: { bg: "bg-gray-100 text-gray-800", icon: XCircle }
    };
    const style = styles[status] || styles.new;
    const Icon = style.icon;
    return (
      <Badge className={`${style.bg} font-medium flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status?.toUpperCase()}
      </Badge>
    );
  };

  const getRequirementSummary = (rfq) => {
    switch (rfq.category) {
      case "cotton":
      case "viscose":
        return (
          <div className="text-sm">
            <span className="text-gray-500">Type:</span> {rfq.fabric_requirement_type || "N/A"}
            <br />
            <span className="text-gray-500">Qty:</span> {formatQuantity(rfq.quantity_meters, "m")}
          </div>
        );
      case "knits":
        return (
          <div className="text-sm">
            <span className="text-gray-500">Quality:</span> {rfq.knit_quality || "N/A"}
            <br />
            <span className="text-gray-500">Qty:</span> {formatQuantity(rfq.quantity_kg, "kg")}
          </div>
        );
      case "denim":
        return (
          <div className="text-sm">
            <span className="text-gray-500">Spec:</span> {rfq.denim_specification?.substring(0, 30) || "N/A"}...
            <br />
            <span className="text-gray-500">Qty:</span> {formatQuantity(rfq.quantity_meters, "m")}
          </div>
        );
      default:
        return <span className="text-gray-400">-</span>;
    }
  };

  const formatQuantity = (value, unit) => {
    if (!value) return "N/A";
    const labels = {
      "less_than_200": "< 200",
      "less_than_1000": "< 1,000",
      "200_500": "200 - 500",
      "500_1000": "500 - 1,000",
      "1000_5000": "1,000 - 5,000",
      "1000_2500": "1,000 - 2,500",
      "1000_plus": "1,000+",
      "2500_7500": "2,500 - 7,500",
      "5000_20000": "5,000 - 20,000",
      "7500_25000": "7,500 - 25,000",
      "20000_50000": "20,000 - 50,000",
      "25000_plus": "25,000+",
      "50000_plus": "50,000+"
    };
    return `${labels[value] || value} ${unit}`;
  };

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

  const openDetails = (rfq) => {
    setSelectedRfq(rfq);
    setDetailsOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="admin-rfq-page">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RFQ Management</h1>
            <p className="text-gray-500 mt-1">View and manage Request for Quotes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-32" data-testid="filter-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="cotton">Cotton</SelectItem>
                  <SelectItem value="knits">Knits</SelectItem>
                  <SelectItem value="denim">Denim</SelectItem>
                  <SelectItem value="viscose">Viscose</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          {["new", "contacted", "quoted", "won", "lost"].map((status) => {
            const count = rfqs.filter(r => r.status === status).length;
            const colors = {
              new: "bg-blue-50 border-blue-200",
              contacted: "bg-yellow-50 border-yellow-200",
              quoted: "bg-purple-50 border-purple-200",
              won: "bg-green-50 border-green-200",
              lost: "bg-red-50 border-red-200"
            };
            return (
              <div key={status} className={`p-4 rounded-lg border ${colors[status]}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-gray-600 capitalize">{status}</p>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">RFQ #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requirements</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading RFQs...
                  </td>
                </tr>
              ) : rfqs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No RFQs found
                  </td>
                </tr>
              ) : (
                rfqs.map((rfq) => (
                  <tr key={rfq.id} className="hover:bg-gray-50" data-testid={`rfq-row-${rfq.rfq_number}`}>
                    <td className="px-4 py-4">
                      <span className="font-mono font-semibold text-blue-600">{rfq.rfq_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      {getCategoryBadge(rfq.category)}
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      {getRequirementSummary(rfq)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{rfq.full_name}</p>
                        <p className="text-gray-500">{rfq.email}</p>
                        <p className="text-gray-500">{rfq.phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDate(rfq.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(rfq.status)}
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDetails(rfq)}
                        data-testid={`view-rfq-${rfq.rfq_number}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Modal */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="font-mono text-blue-600">{selectedRfq?.rfq_number}</span>
                {selectedRfq && getCategoryBadge(selectedRfq.category)}
              </DialogTitle>
            </DialogHeader>
            
            {selectedRfq && (
              <div className="space-y-6">
                {/* Status Update */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500">Current Status</p>
                    {getStatusBadge(selectedRfq.status)}
                  </div>
                  <Select
                    value={selectedRfq.status}
                    onValueChange={(val) => updateStatus(selectedRfq.id, val)}
                  >
                    <SelectTrigger className="w-40" data-testid="update-status">
                      <SelectValue placeholder="Update Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Requirement Details */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Requirement Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Category</p>
                      <p className="font-medium">{selectedRfq.category?.toUpperCase()}</p>
                    </div>
                    
                    {(selectedRfq.category === "cotton" || selectedRfq.category === "viscose") && (
                      <>
                        <div>
                          <p className="text-gray-500">Fabric Type</p>
                          <p className="font-medium">{selectedRfq.fabric_requirement_type || "Not specified"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Quantity</p>
                          <p className="font-medium">{formatQuantity(selectedRfq.quantity_meters, "meters")}</p>
                        </div>
                      </>
                    )}
                    
                    {selectedRfq.category === "knits" && (
                      <>
                        <div>
                          <p className="text-gray-500">Quality</p>
                          <p className="font-medium">{selectedRfq.knit_quality || "Not specified"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Quantity</p>
                          <p className="font-medium">{formatQuantity(selectedRfq.quantity_kg, "kg")}</p>
                        </div>
                      </>
                    )}
                    
                    {selectedRfq.category === "denim" && (
                      <>
                        <div className="col-span-2">
                          <p className="text-gray-500">Specification</p>
                          <p className="font-medium">{selectedRfq.denim_specification || "Not specified"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Quantity</p>
                          <p className="font-medium">{formatQuantity(selectedRfq.quantity_meters, "meters")}</p>
                        </div>
                      </>
                    )}

                    {selectedRfq.gst_number && (
                      <div>
                        <p className="text-gray-500">GST Number</p>
                        <p className="font-medium">{selectedRfq.gst_number}</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedRfq.message && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-gray-500 text-sm">Additional Notes</p>
                      <p className="mt-1">{selectedRfq.message}</p>
                    </div>
                  )}
                </div>

                {/* Contact Information */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-semibold text-sm">
                          {selectedRfq.full_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{selectedRfq.full_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <a href={`mailto:${selectedRfq.email}`} className="text-blue-600 hover:underline">
                        {selectedRfq.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <a href={`tel:${selectedRfq.phone}`} className="text-blue-600 hover:underline">
                        {selectedRfq.phone}
                      </a>
                    </div>
                    {selectedRfq.website && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <a href={selectedRfq.website.startsWith('http') ? selectedRfq.website : `https://${selectedRfq.website}`} 
                           target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {selectedRfq.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="text-sm text-gray-500">
                  <p>Submitted: {formatDate(selectedRfq.created_at)}</p>
                  {selectedRfq.updated_at && <p>Last Updated: {formatDate(selectedRfq.updated_at)}</p>}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminRFQ;
