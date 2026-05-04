import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Upload } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import api, { getCategories, createCategory, updateCategory, deleteCategory, uploadImage } from "../../lib/api";

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [uploading, setUploading] = useState(false);

  const emptyForm = { name: "", description: "", image_url: "", seo_title: "", seo_meta_description: "", seo_intro: "", seo_applications: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await getCategories();
      setCategories(res.data);
    } catch (err) {
      toast.error("Failed to load categories");
    }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    setUploading(true);
    try {
      const res = await uploadImage(file);
      setForm({ ...form, image_url: res.data.url });
      toast.success("Image uploaded");
    } catch (err) {
      toast.error("Failed to upload image");
    }
    setUploading(false);
  };

  const removeImage = () => {
    setForm({ ...form, image_url: "" });
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      description: category.description || "",
      image_url: category.image_url || "",
      seo_title: category.seo_title || "",
      seo_meta_description: category.seo_meta_description || "",
      seo_intro: category.seo_intro || "",
      seo_applications: category.seo_applications || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Please enter category name");
      return;
    }

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, form);
        toast.success("Category updated");
      } else {
        await createCategory(form);
        toast.success("Category created");
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save category");
    }
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}"? This will not delete associated fabrics.`)) return;
    try {
      await deleteCategory(category.id);
      toast.success("Category deleted");
      fetchCategories();
    } catch (err) {
      toast.error("Failed to delete category");
    }
  };

  const hasBlended = categories.some((c) => c.name === "Blended Fabrics");
  const hasKnits = categories.some((c) => c.name === "Knits");
  const hasGreige = categories.some((c) => c.name === "Greige");

  const migrateBlended = async (mode) => {
    const label = mode === "all_to_linen" ? "move all Blended → Linen" : "smart-migrate Blended";
    if (!window.confirm(`This will ${label} and delete the Blended category. Proceed?`)) return;
    try {
      // Dry run first so we can show counts in the confirm
      const dryRes = await api.post(`/migrate/blended?mode=${mode}`);
      const total = dryRes.data?.blended_fabrics_total || 0;
      if (total === 0) {
        toast.info(dryRes.data?.message || "Nothing to migrate");
        fetchCategories();
        return;
      }
      if (!window.confirm(`Found ${total} Blended fabrics. Apply the migration?`)) return;
      const res = await api.post(`/migrate/blended?apply=true&mode=${mode}`);
      toast.success(`Migrated ${res.data?.reassigned || 0} fabrics. Blended deleted: ${res.data?.blended_deleted}`);
      fetchCategories();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Migration failed");
    }
  };

  const migrateKnits = async () => {
    if (!window.confirm("This will move every Knits fabric → Polyester Fabrics and delete the Knits category. Proceed?")) return;
    try {
      const dryRes = await api.post("/migrate/knits");
      const total = dryRes.data?.knits_fabrics_total || 0;
      if (total === 0) {
        toast.info(dryRes.data?.message || "Nothing to migrate");
        fetchCategories();
        return;
      }
      if (!window.confirm(`Found ${total} Knits fabrics. Move them all to Polyester Fabrics and delete the Knits category?`)) return;
      const res = await api.post("/migrate/knits?apply=true");
      toast.success(`Migrated ${res.data?.reassigned || 0} fabrics → Polyester. Knits deleted: ${res.data?.knits_deleted}`);
      fetchCategories();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Migration failed");
    }
  };

  const deleteGreige = async () => {
    try {
      const dryRes = await api.post("/migrate/greige");
      const count = dryRes.data?.fabrics_in_greige ?? 0;
      if (dryRes.data?.status === "noop") {
        toast.info(dryRes.data?.message || "No Greige category to delete");
        fetchCategories();
        return;
      }
      if (count > 0) {
        toast.error(
          `Cannot delete: ${count} fabric(s) still use Greige as category. Re-classify them to another category first (use /admin/fabrics → Edit).`
        );
        return;
      }
      if (!window.confirm("Greige is empty. Delete the category? (Greige is now available as a Pattern, not a Category.)")) return;
      const res = await api.post("/migrate/greige?apply=true");
      toast.success(res.data?.greige_deleted ? "Greige category deleted." : "Nothing changed.");
      fetchCategories();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-categories-page">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold">Categories</h1>
          <div className="flex items-center gap-2">
            {hasBlended && (
              <>
                <button
                  onClick={() => migrateBlended("all_to_linen")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded border border-orange-300 bg-orange-50 text-orange-900 text-sm font-medium hover:bg-orange-100"
                  data-testid="migrate-blended-linen-btn"
                  title="Bulk-move every Blended fabric to Linen, then delete the Blended category"
                >
                  Move Blended → Linen
                </button>
              </>
            )}
            {hasKnits && (
              <button
                onClick={migrateKnits}
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-purple-300 bg-purple-50 text-purple-900 text-sm font-medium hover:bg-purple-100"
                data-testid="migrate-knits-polyester-btn"
                title="Bulk-move every Knits fabric to Polyester Fabrics, then delete the Knits category"
              >
                Move Knits → Polyester
              </button>
            )}
            {hasGreige && (
              <button
                onClick={deleteGreige}
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900 text-sm font-medium hover:bg-rose-100"
                data-testid="delete-greige-btn"
                title="Greige is now a Pattern, not a Category. Delete the category if empty."
              >
                Delete Greige Category
              </button>
            )}
            <button onClick={openCreateModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-category-btn">
              <Plus size={18} />
              Add Category
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 animate-pulse rounded">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-gray-200 w-2/3 rounded" />
                  <div className="h-4 bg-gray-200 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded">
            <p className="text-gray-500 mb-4">No categories yet</p>
            <button onClick={openCreateModal} className="btn-primary">Add First Category</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="categories-grid">
            {categories.map((category) => (
              <div key={category.id} className="bg-white border border-gray-100 overflow-hidden rounded" data-testid={`category-card-${category.id}`}>
                <div className="aspect-[4/3] bg-gray-100">
                  <img
                    src={category.image_url || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400"}
                    alt={category.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-lg mb-1">{category.name}</h3>
                  <p className="text-gray-500 text-sm line-clamp-2">{category.description || "No description"}</p>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => openEditModal(category)}
                      className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2"
                      data-testid={`edit-category-${category.id}`}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2 hover:border-red-500 hover:text-red-500"
                      data-testid={`delete-category-${category.id}`}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="category-modal">
            <div className="bg-white w-full max-w-md rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingCategory ? "Edit Category" : "Add Category"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="e.g., Cotton Fabrics"
                    required
                    data-testid="category-name-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded h-24 resize-none"
                    placeholder="Brief description of this category"
                    data-testid="category-description-input"
                  />
                </div>

                {/* SEO fields — rendered above/below the grid on /fabrics?category=X */}
                <details className="border border-gray-200 rounded-lg">
                  <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-gray-800 bg-gray-50 rounded-lg">SEO Content (shown on /fabrics listing)</summary>
                  <div className="p-4 space-y-3 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-medium mb-1">SEO Title (browser tab)</label>
                      <input type="text" value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="e.g. Buy Premium Cotton Fabrics Online" data-testid="category-seo-title" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Meta Description</label>
                      <textarea value={form.seo_meta_description} onChange={(e) => setForm({ ...form, seo_meta_description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded text-sm resize-none" placeholder="1-2 sentences. Shows in Google search results." data-testid="category-seo-meta" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Intro (HTML allowed) — shown ABOVE the grid</label>
                      <textarea value={form.seo_intro} onChange={(e) => setForm({ ...form, seo_intro: e.target.value })} rows={5} className="w-full px-3 py-2 border border-gray-200 rounded text-sm font-mono" placeholder="<h2>About Cotton Fabrics</h2><p>Cotton is a natural...</p>" data-testid="category-seo-intro" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Applications / Use Cases (HTML allowed) — shown BELOW the grid</label>
                      <textarea value={form.seo_applications} onChange={(e) => setForm({ ...form, seo_applications: e.target.value })} rows={5} className="w-full px-3 py-2 border border-gray-200 rounded text-sm font-mono" placeholder="<h3>Popular Uses</h3><ul><li>Shirting</li>...</ul>" data-testid="category-seo-applications" />
                    </div>
                  </div>
                </details>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Category Image</label>
                  
                  {form.image_url ? (
                    <div className="relative">
                      <img 
                        src={form.image_url} 
                        alt="Category preview" 
                        className="w-full h-48 object-cover rounded border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                        aria-label="Remove image"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-[#2563EB] hover:bg-blue-50/50 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                        data-testid="category-image-upload"
                      />
                      {uploading ? (
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mb-2" />
                          <span className="text-sm text-gray-500">Uploading...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Upload size={32} className="text-gray-400 mb-2" />
                          <span className="text-sm font-medium text-gray-600">Click to upload image</span>
                          <span className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP up to 10MB</span>
                        </div>
                      )}
                    </label>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1" data-testid="save-category-btn">
                    {editingCategory ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCategories;
