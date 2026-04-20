import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Upload, Star, Check, Package } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getCollections, getFabrics, createCollection, updateCollection, deleteCollection, uploadImage } from "../../lib/api";

const AdminCollections = () => {
  const [collections, setCollections] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searchFabric, setSearchFabric] = useState("");

  const emptyForm = {
    name: "",
    description: "",
    image_url: "",
    fabric_ids: [],
    is_featured: false,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [collRes, fabRes] = await Promise.all([
        getCollections(), 
        getFabrics({ limit: 1000 })  // Fetch all fabrics for collection assignment
      ]);
      setCollections(collRes.data);
      setFabrics(fabRes.data);
    } catch (err) {
      toast.error("Failed to load data");
    }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadImage(file);
      const imageUrl = `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
      setForm({ ...form, image_url: imageUrl });
      toast.success("Image uploaded");
    } catch (err) {
      toast.error("Failed to upload image");
    }
    setUploading(false);
  };

  const removeImage = () => {
    setForm({ ...form, image_url: "" });
  };

  const toggleFabric = (fabricId) => {
    if (form.fabric_ids.includes(fabricId)) {
      setForm({ ...form, fabric_ids: form.fabric_ids.filter(id => id !== fabricId) });
    } else {
      setForm({ ...form, fabric_ids: [...form.fabric_ids, fabricId] });
    }
  };

  const openCreateModal = () => {
    setEditingCollection(null);
    setForm(emptyForm);
    setSearchFabric("");
    setShowModal(true);
  };

  const openEditModal = (collection) => {
    setEditingCollection(collection);
    setForm({
      name: collection.name,
      description: collection.description || "",
      image_url: collection.image_url || "",
      fabric_ids: collection.fabric_ids || [],
      is_featured: collection.is_featured || false,
    });
    setSearchFabric("");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Please enter a collection name");
      return;
    }

    try {
      if (editingCollection) {
        await updateCollection(editingCollection.id, form);
        toast.success("Collection updated");
      } else {
        await createCollection(form);
        toast.success("Collection created");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save collection");
    }
  };

  const handleDelete = async (collection) => {
    if (!window.confirm(`Delete "${collection.name}"? This will not delete the fabrics.`)) return;
    try {
      await deleteCollection(collection.id);
      toast.success("Collection deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete collection");
    }
  };

  const filteredFabrics = fabrics.filter(f => 
    f.name.toLowerCase().includes(searchFabric.toLowerCase()) ||
    f.category_name?.toLowerCase().includes(searchFabric.toLowerCase())
  );

  const selectedFabrics = fabrics.filter(f => form.fabric_ids.includes(f.id));

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="text-gray-500 mt-1">Marketing ranges and occasion-specific fabric groupings</p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn-primary inline-flex items-center gap-2"
          data-testid="add-collection-btn"
        >
          <Plus size={18} />
          Add Collection
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-16 bg-white rounded border border-gray-100">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">No collections yet</p>
          <button onClick={openCreateModal} className="btn-primary">
            Add First Collection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="collections-grid">
          {collections.map((collection) => (
            <div key={collection.id} className="bg-white border border-gray-100 rounded overflow-hidden" data-testid={`collection-card-${collection.id}`}>
              {collection.image_url ? (
                <div className="aspect-video relative">
                  <img
                    src={collection.image_url}
                    alt={collection.name}
                    className="w-full h-full object-cover"
                  />
                  {collection.is_featured && (
                    <span className="absolute top-2 right-2 px-2 py-1 bg-amber-500 text-white text-xs rounded flex items-center gap-1">
                      <Star size={12} fill="white" />
                      Featured
                    </span>
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center relative">
                  <Package size={48} className="text-blue-200" />
                  {collection.is_featured && (
                    <span className="absolute top-2 right-2 px-2 py-1 bg-amber-500 text-white text-xs rounded flex items-center gap-1">
                      <Star size={12} fill="white" />
                      Featured
                    </span>
                  )}
                </div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1">{collection.name}</h3>
                {collection.description && (
                  <p className="text-gray-500 text-sm line-clamp-2 mb-3">{collection.description}</p>
                )}
                <p className="text-sm text-[#2563EB] font-medium mb-4">
                  {collection.fabric_count} {collection.fabric_count === 1 ? 'fabric' : 'fabrics'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(collection)}
                    className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2"
                    data-testid={`edit-collection-${collection.id}`}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(collection)}
                    className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2 hover:border-red-500 hover:text-red-500"
                    data-testid={`delete-collection-${collection.id}`}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="collection-modal">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingCollection ? "Edit Collection" : "Add Collection"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium mb-2">Collection Image</label>
                {form.image_url ? (
                  <div className="relative w-full aspect-video bg-gray-100 rounded overflow-hidden">
                    <img
                      src={form.image_url}
                      alt="Collection"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="block w-full aspect-video border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                      data-testid="collection-image-upload"
                    />
                    {uploading ? (
                      <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload size={32} className="text-gray-400 mb-2" />
                        <span className="text-gray-500 text-sm">Click to upload collection image</span>
                      </>
                    )}
                  </label>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Collection Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded"
                  placeholder="e.g., Summer 2026, Wedding Collection"
                  required
                  data-testid="collection-name-input"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded h-24 resize-none"
                  placeholder="Describe this collection..."
                  data-testid="collection-description-input"
                />
              </div>

              {/* Featured Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_featured: !form.is_featured })}
                  className={`w-12 h-6 rounded-full transition-colors ${form.is_featured ? 'bg-[#2563EB]' : 'bg-gray-200'}`}
                  data-testid="collection-featured-toggle"
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_featured ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
                <label className="text-sm font-medium">Feature on homepage</label>
              </div>

              {/* Selected Fabrics */}
              {selectedFabrics.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Selected Fabrics ({selectedFabrics.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedFabrics.map(fabric => (
                      <span
                        key={fabric.id}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded flex items-center gap-2"
                      >
                        {fabric.name}
                        <button
                          type="button"
                          onClick={() => toggleFabric(fabric.id)}
                          className="hover:text-blue-900"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fabric Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Add Fabrics to Collection</label>
                <input
                  type="text"
                  value={searchFabric}
                  onChange={(e) => setSearchFabric(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded mb-3"
                  placeholder="Search fabrics by name or category..."
                  data-testid="collection-fabric-search"
                />
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded" data-testid="fabric-selection-list">
                  {filteredFabrics.length === 0 ? (
                    <p className="p-4 text-gray-500 text-center text-sm">No fabrics found</p>
                  ) : (
                    filteredFabrics.map(fabric => (
                      <div
                        key={fabric.id}
                        onClick={() => toggleFabric(fabric.id)}
                        className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${
                          form.fabric_ids.includes(fabric.id) ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          form.fabric_ids.includes(fabric.id) ? 'bg-[#2563EB] border-[#2563EB]' : 'border-gray-300'
                        }`}>
                          {form.fabric_ids.includes(fabric.id) && <Check size={14} className="text-white" />}
                        </div>
                        {fabric.images?.[0] && (
                          <img src={fabric.images[0]} alt="" className="w-10 h-10 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{fabric.name}</p>
                          <p className="text-xs text-gray-500">{fabric.category_name}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary py-3"
                  data-testid="save-collection-btn"
                >
                  {editingCollection ? "Update Collection" : "Create Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminCollections;
