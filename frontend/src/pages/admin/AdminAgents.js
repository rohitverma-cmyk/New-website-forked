import { useState, useEffect } from "react";
import { Users, Plus, RefreshCw, Search, Pencil, X, Eye, BarChart3, CheckCircle, XCircle } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const AdminAgents = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "" });
  const [creating, setCreating] = useState(false);
  // Edit modal
  const [editAgent, setEditAgent] = useState(null);
  const [editData, setEditData] = useState({ name: "", phone: "", status: "" });
  // Stats modal
  const [statsModal, setStatsModal] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const token = localStorage.getItem("locofast_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => { fetchAgents(); }, []);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/admin/list`, { headers });
      setAgents(await res.json());
    } catch {
      toast.error("Failed to load agents");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newAgent.name.trim() || !newAgent.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/agent/admin/create`, {
        method: "POST", headers, body: JSON.stringify(newAgent)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success(`Agent ${data.name} created`);
      setShowCreate(false);
      setNewAgent({ name: "", email: "", phone: "" });
      fetchAgents();
    } catch (err) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  const handleEdit = async () => {
    if (!editAgent) return;
    try {
      const res = await fetch(`${API}/api/agent/admin/${editAgent.id}`, {
        method: "PUT", headers, body: JSON.stringify(editData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success("Agent updated");
      setEditAgent(null);
      fetchAgents();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleViewStats = async (agent) => {
    setStatsModal(agent);
    setStatsLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/admin/${agent.id}/stats`, { headers });
      setStatsData(await res.json());
    } catch {
      toast.error("Failed to load stats");
    }
    setStatsLoading(false);
  };

  const filteredAgents = agents.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return a.name?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s);
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";

  return (
    <AdminLayout>
      <div className="p-8" data-testid="admin-agents-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Sales Agents</h1>
            <p className="text-gray-500 mt-1">Manage agents for assisted bookings</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700" data-testid="create-agent-btn">
              <Plus size={16} />Create Agent
            </button>
            <button onClick={fetchAgents} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              <RefreshCw size={16} />Refresh
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-lg border"><p className="text-sm text-gray-500">Total Agents</p><p className="text-3xl font-semibold">{agents.length}</p></div>
          <div className="bg-emerald-50 p-5 rounded-lg border border-emerald-200"><p className="text-sm text-emerald-700">Active</p><p className="text-3xl font-semibold text-emerald-700">{agents.filter(a => a.status === "active").length}</p></div>
          <div className="bg-gray-50 p-5 rounded-lg border"><p className="text-sm text-gray-500">Inactive</p><p className="text-3xl font-semibold text-gray-500">{agents.filter(a => a.status !== "active").length}</p></div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search agents..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="agent-search" />
        </div>

        {/* Agents Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> : filteredAgents.length === 0 ? <div className="p-8 text-center text-gray-500">No agents found</div> : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAgents.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50" data-testid={`agent-row-${a.id}`}>
                    <td className="px-4 py-4 font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{a.email}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{a.phone || "-"}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {a.status === "active" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">{formatDate(a.created_at)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleViewStats(a)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Stats" data-testid={`stats-btn-${a.id}`}><BarChart3 size={16} /></button>
                        <button onClick={() => { setEditAgent(a); setEditData({ name: a.name, phone: a.phone || "", status: a.status }); }} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit" data-testid={`edit-agent-btn-${a.id}`}><Pencil size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* CREATE MODAL */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="create-agent-modal">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create Agent</h3>
                <button onClick={() => setShowCreate(false)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input type="text" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="Agent name" data-testid="new-agent-name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input type="email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="agent@locofast.com" data-testid="new-agent-email" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="+91 98765 43210" data-testid="new-agent-phone" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 px-4 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" data-testid="save-agent-btn">{creating ? "Creating..." : "Create Agent"}</button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODAL */}
        {editAgent && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditAgent(null)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="edit-agent-modal">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Edit Agent — {editAgent.name}</h3>
                <button onClick={() => setEditAgent(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input type="text" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="edit-agent-name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="edit-agent-phone" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={editData.status} onChange={(e) => setEditData({ ...editData, status: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:border-blue-500 focus:outline-none" data-testid="edit-agent-status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditAgent(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleEdit} className="flex-1 px-4 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700" data-testid="update-agent-btn">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* STATS MODAL */}
        {statsModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setStatsModal(null); setStatsData(null); }}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="agent-stats-modal">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Performance — {statsModal.name}</h3>
                <button onClick={() => { setStatsModal(null); setStatsData(null); }}><X size={20} className="text-gray-400" /></button>
              </div>
              {statsLoading ? <div className="py-8 text-center text-gray-500">Loading...</div> : statsData ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg"><p className="text-xs text-blue-600 font-medium">Carts Shared</p><p className="text-2xl font-semibold text-blue-700">{statsData.total_carts_shared}</p></div>
                  <div className="bg-emerald-50 p-4 rounded-lg"><p className="text-xs text-emerald-600 font-medium">Completed</p><p className="text-2xl font-semibold text-emerald-700">{statsData.completed_carts}</p></div>
                  <div className="bg-purple-50 p-4 rounded-lg"><p className="text-xs text-purple-600 font-medium">Total Orders</p><p className="text-2xl font-semibold text-purple-700">{statsData.total_orders}</p></div>
                  <div className="bg-amber-50 p-4 rounded-lg"><p className="text-xs text-amber-600 font-medium">Revenue</p><p className="text-2xl font-semibold text-amber-700">₹{statsData.total_revenue?.toLocaleString()}</p></div>
                  <div className="col-span-2 bg-gray-50 p-4 rounded-lg text-center"><p className="text-xs text-gray-600 font-medium">Conversion Rate</p><p className="text-3xl font-semibold text-gray-900">{statsData.conversion_rate}%</p></div>
                </div>
              ) : <div className="py-8 text-center text-gray-500">No data</div>}
              <button onClick={() => { setStatsModal(null); setStatsData(null); }} className="w-full mt-4 px-4 py-2.5 bg-gray-100 rounded-lg hover:bg-gray-200">Close</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAgents;
