import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Layers, Package } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getArticles, getCategories, getSellers, createArticle, updateArticle, deleteArticle } from "../../lib/api";

const AdminArticles = () => {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);

  const emptyForm = {
    name: "",
    description: "",
    seller_id: "",
    category_id: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [artRes, catRes, selRes] = await Promise.all([
        getArticles(),
        getCategories(),
        getSellers(true),
      ]);
      setArticles(artRes.data);
      setCategories(catRes.data);
      setSellers(selRes.data);
    } catch (err) {
      toast.error("Failed to load data");
    }
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingArticle(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (article) => {
    setEditingArticle(article);
    setForm({
      name: article.name,
      description: article.description || "",
      seller_id: article.seller_id || "",
      category_id: article.category_id || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Please enter article name");
      return;
    }

    try {
      if (editingArticle) {
        await updateArticle(editingArticle.id, form);
        toast.success("Article updated");
      } else {
        await createArticle(form);
        toast.success("Article created");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save article");
    }
  };

  const handleDelete = async (article) => {
    if (!window.confirm(`Delete "${article.name}"? Fabrics linked to this article will become standalone.`)) return;
    try {
      await deleteArticle(article.id);
      toast.success("Article deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete article");
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-articles-page">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Articles</h1>
            <p className="text-gray-500 text-sm mt-1">Group fabric color variants under articles</p>
          </div>
          <button onClick={openCreateModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-article-btn">
            <Plus size={18} />
            Add Article
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 animate-pulse rounded p-6">
                <div className="h-5 bg-gray-200 w-2/3 rounded mb-2" />
                <div className="h-4 bg-gray-200 w-full rounded mb-4" />
                <div className="h-8 bg-gray-200 w-1/3 rounded" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded">
            <Layers size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No articles yet</p>
            <p className="text-gray-400 text-sm mb-6">Articles help you group fabric color variants together</p>
            <button onClick={openCreateModal} className="btn-primary">Add First Article</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="articles-grid">
            {articles.map((article) => (
              <div key={article.id} className="bg-white border border-gray-100 rounded p-6" data-testid={`article-card-${article.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{article.name}</h3>
                    <p className="text-[#2563EB] text-xs font-mono">{article.article_code}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                    <Package size={14} />
                    {article.variant_count} variants
                  </div>
                </div>
                
                {article.description && (
                  <p className="text-gray-600 text-sm line-clamp-2 mb-3">{article.description}</p>
                )}

                <div className="space-y-1 mb-4">
                  {article.seller_name && (
                    <p className="text-gray-500 text-sm">Seller: {article.seller_name}</p>
                  )}
                  {article.category_name && (
                    <p className="text-gray-500 text-sm">Category: {article.category_name}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => openEditModal(article)}
                    className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2"
                    data-testid={`edit-article-${article.id}`}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(article)}
                    className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2 hover:border-red-500 hover:text-red-500"
                    data-testid={`delete-article-${article.id}`}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="article-modal">
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingArticle ? "Edit Article" : "Add Article"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Article Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="e.g., Cotton Poplin Range"
                    required
                    data-testid="article-name-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                    placeholder="Brief description of this article group..."
                    data-testid="article-description-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Seller</label>
                  <select
                    value={form.seller_id}
                    onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                    data-testid="article-seller-select"
                  >
                    <option value="">No seller specified</option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.company_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                    data-testid="article-category-select"
                  >
                    <option value="">No category specified</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-100 rounded">
                  <p className="text-sm text-blue-700">
                    <strong>Tip:</strong> After creating an article, go to Fabrics and link color variants to this article using the "Article" dropdown.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1" data-testid="save-article-btn">
                    {editingArticle ? "Update" : "Create"}
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

export default AdminArticles;
