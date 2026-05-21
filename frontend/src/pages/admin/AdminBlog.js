import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, FileText, Tag, FolderOpen, Eye, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import MDEditor from "@uiw/react-md-editor";
import AdminLayout from "../../components/admin/AdminLayout";
import { useConfirm } from "../../components/useConfirm";
import {
  getBlogPosts, getBlogCategories, getBlogTags,
  createBlogPost, updateBlogPost, deleteBlogPost,
  createBlogCategory, updateBlogCategory, deleteBlogCategory,
  createBlogTag, deleteBlogTag,
  uploadImage, getBlogStats
} from "../../lib/api";

const AdminBlog = () => {
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const emptyPostForm = {
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    featured_image: "",
    category_id: "",
    tag_ids: [],
    status: "draft",
    meta_title: "",
    meta_description: "",
    canonical_url: "",
    og_title: "",
    og_description: "",
    og_image: ""
  };
  const [postForm, setPostForm] = useState(emptyPostForm);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", description: "" });
  const [tagForm, setTagForm] = useState({ name: "", slug: "" });
  const [showSEOFields, setShowSEOFields] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch posts, categories, and tags (all required)
      const [postsRes, catsRes, tagsRes] = await Promise.all([
        getBlogPosts(),
        getBlogCategories(),
        getBlogTags()
      ]);
      setPosts(postsRes.data);
      setCategories(catsRes.data);
      setTags(tagsRes.data);
      
      // Fetch stats separately (optional, may fail without auth)
      try {
        const statsRes = await getBlogStats();
        setStats(statsRes.data);
      } catch (statsErr) {
        console.log("Stats not available:", statsErr);
        // Set default stats if can't fetch
        setStats({
          total_posts: postsRes.data.length,
          published_posts: postsRes.data.filter(p => p.status === 'published').length,
          draft_posts: postsRes.data.filter(p => p.status === 'draft').length,
          total_categories: catsRes.data.length,
          total_tags: tagsRes.data.length
        });
      }
    } catch (err) {
      toast.error("Failed to load blog data");
    }
    setLoading(false);
  };

  // Posts handlers
  const openCreatePostModal = () => {
    setEditingPost(null);
    setPostForm(emptyPostForm);
    setShowSEOFields(false);
    setShowPostModal(true);
  };

  const openEditPostModal = (post) => {
    setEditingPost(post);
    setPostForm({
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt || "",
      featured_image: post.featured_image || "",
      category_id: post.category_id || "",
      tag_ids: post.tag_ids || [],
      status: post.status,
      meta_title: post.meta_title || "",
      meta_description: post.meta_description || "",
      canonical_url: post.canonical_url || "",
      og_title: post.og_title || "",
      og_description: post.og_description || "",
      og_image: post.og_image || ""
    });
    setShowSEOFields(false);
    setShowPostModal(true);
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (!postForm.title || !postForm.content) {
      toast.error("Title and content are required");
      return;
    }

    try {
      if (editingPost) {
        await updateBlogPost(editingPost.id, postForm);
        toast.success("Post updated");
      } else {
        await createBlogPost(postForm);
        toast.success("Post created");
      }
      setShowPostModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save post");
    }
  };

  const handleDeletePost = async (post) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${post.title}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteBlogPost(post.id);
      toast.success("Post deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete post");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setPostForm({ ...postForm, featured_image: res.data.url });
      toast.success("Image uploaded");
    } catch (err) {
      toast.error("Failed to upload image");
    }
    setUploading(false);
  };

  const toggleTag = (tagId) => {
    const newTagIds = postForm.tag_ids.includes(tagId)
      ? postForm.tag_ids.filter(id => id !== tagId)
      : [...postForm.tag_ids, tagId];
    setPostForm({ ...postForm, tag_ids: newTagIds });
  };

  // Category handlers
  const openCreateCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", slug: "", description: "" });
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, slug: cat.slug, description: cat.description || "" });
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!categoryForm.name) {
      toast.error("Category name is required");
      return;
    }

    try {
      if (editingCategory) {
        await updateBlogCategory(editingCategory.id, categoryForm);
        toast.success("Category updated");
      } else {
        await createBlogCategory(categoryForm);
        toast.success("Category created");
      }
      setShowCategoryModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save category");
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${cat.name}"? Posts in this category will become uncategorized.`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteBlogCategory(cat.id);
      toast.success("Category deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete category");
    }
  };

  // Tag handlers
  const handleTagSubmit = async (e) => {
    e.preventDefault();
    if (!tagForm.name) {
      toast.error("Tag name is required");
      return;
    }

    try {
      await createBlogTag(tagForm);
      toast.success("Tag created");
      setShowTagModal(false);
      setTagForm({ name: "", slug: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create tag");
    }
  };

  const handleDeleteTag = async (tag) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${tag.name}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteBlogTag(tag.id);
      toast.success("Tag deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete tag");
    }
  };

  // Filter posts
  const filteredPosts = posts.filter(post => {
    if (searchQuery && !post.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter && post.status !== statusFilter) return false;
    if (categoryFilter && post.category_id !== categoryFilter) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div data-testid="admin-blog-page">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Blog</h1>
            <p className="text-gray-500 text-sm mt-1">Manage blog posts, categories, and tags</p>
          </div>
          {activeTab === "posts" && (
            <button onClick={openCreatePostModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-post-btn">
              <Plus size={18} />
              New Post
            </button>
          )}
          {activeTab === "categories" && (
            <button onClick={openCreateCategoryModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-category-btn">
              <Plus size={18} />
              Add Category
            </button>
          )}
          {activeTab === "tags" && (
            <button onClick={() => setShowTagModal(true)} className="btn-primary inline-flex items-center gap-2" data-testid="add-tag-btn">
              <Plus size={18} />
              Add Tag
            </button>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white border border-gray-100 rounded p-4">
              <p className="text-gray-500 text-sm">Total Posts</p>
              <p className="text-2xl font-semibold">{stats.total_posts}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded p-4">
              <p className="text-gray-500 text-sm">Published</p>
              <p className="text-2xl font-semibold text-green-600">{stats.published_posts}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded p-4">
              <p className="text-gray-500 text-sm">Drafts</p>
              <p className="text-2xl font-semibold text-yellow-600">{stats.draft_posts}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded p-4">
              <p className="text-gray-500 text-sm">Categories</p>
              <p className="text-2xl font-semibold">{stats.total_categories}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded p-4">
              <p className="text-gray-500 text-sm">Tags</p>
              <p className="text-2xl font-semibold">{stats.total_tags}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("posts")}
            className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "posts" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
            data-testid="tab-posts"
          >
            <FileText size={16} className="inline mr-2" />
            Posts ({posts.length})
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "categories" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
            data-testid="tab-categories"
          >
            <FolderOpen size={16} className="inline mr-2" />
            Categories ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab("tags")}
            className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "tags" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
            data-testid="tab-tags"
          >
            <Tag size={16} className="inline mr-2" />
            Tags ({tags.length})
          </button>
        </div>

        {/* Posts Tab */}
        {activeTab === "posts" && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search posts..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded"
                    data-testid="search-posts"
                  />
                </div>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded bg-white"
                data-testid="filter-status"
              >
                <option value="">All Status</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded bg-white"
                data-testid="filter-category"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-white border border-gray-100 animate-pulse rounded p-4 flex gap-4">
                    <div className="w-24 h-16 bg-gray-200 rounded" />
                    <div className="flex-1">
                      <div className="h-5 bg-gray-200 w-1/3 rounded mb-2" />
                      <div className="h-4 bg-gray-200 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-20 bg-white border border-gray-100 rounded">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-4">{searchQuery || statusFilter || categoryFilter ? "No posts match your filters" : "No blog posts yet"}</p>
                <button onClick={openCreatePostModal} className="btn-primary">Create First Post</button>
              </div>
            ) : (
              <div className="space-y-4" data-testid="posts-list">
                {filteredPosts.map((post) => (
                  <div key={post.id} className="bg-white border border-gray-100 rounded p-4 flex gap-4" data-testid={`post-card-${post.id}`}>
                    {post.featured_image ? (
                      <img src={post.featured_image} alt="" className="w-24 h-16 object-cover rounded" />
                    ) : (
                      <div className="w-24 h-16 bg-gray-100 rounded flex items-center justify-center">
                        <FileText size={24} className="text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold truncate">{post.title}</h3>
                          <p className="text-gray-500 text-sm line-clamp-1">{post.excerpt || "No excerpt"}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${post.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {post.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        {post.category_name && <span className="bg-gray-100 px-2 py-0.5 rounded">{post.category_name}</span>}
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                        {post.tags?.length > 0 && (
                          <span>{post.tags.length} tags</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                        title="Preview"
                      >
                        <Eye size={18} />
                      </a>
                      <button
                        onClick={() => openEditPostModal(post)}
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                        title="Edit"
                        data-testid={`edit-post-${post.id}`}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeletePost(post)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                        data-testid={`delete-post-${post.id}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === "categories" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="categories-grid">
            {categories.length === 0 ? (
              <div className="col-span-full text-center py-20 bg-white border border-gray-100 rounded">
                <FolderOpen size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-4">No categories yet</p>
                <button onClick={openCreateCategoryModal} className="btn-primary">Create First Category</button>
              </div>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="bg-white border border-gray-100 rounded p-4" data-testid={`category-card-${cat.id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{cat.name}</h3>
                      <p className="text-gray-400 text-xs">/blog/category/{cat.slug}</p>
                    </div>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                      {cat.post_count} posts
                    </span>
                  </div>
                  {cat.description && (
                    <p className="text-gray-500 text-sm line-clamp-2 mb-3">{cat.description}</p>
                  )}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => openEditCategoryModal(cat)}
                      className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2"
                      data-testid={`edit-category-${cat.id}`}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="flex-1 btn-secondary text-sm py-2 inline-flex items-center justify-center gap-2 hover:border-red-500 hover:text-red-500"
                      data-testid={`delete-category-${cat.id}`}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tags Tab */}
        {activeTab === "tags" && (
          <div>
            {tags.length === 0 ? (
              <div className="text-center py-20 bg-white border border-gray-100 rounded">
                <Tag size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-4">No tags yet</p>
                <button onClick={() => setShowTagModal(true)} className="btn-primary">Create First Tag</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3" data-testid="tags-list">
                {tags.map((tag) => (
                  <div key={tag.id} className="bg-white border border-gray-100 rounded px-4 py-2 flex items-center gap-3" data-testid={`tag-item-${tag.id}`}>
                    <Tag size={14} className="text-gray-400" />
                    <span className="font-medium">{tag.name}</span>
                    <span className="text-gray-400 text-sm">({tag.post_count})</span>
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="text-gray-400 hover:text-red-500 ml-1"
                      title="Delete tag"
                      data-testid={`delete-tag-${tag.id}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Post Modal */}
        {showPostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="post-modal">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg">
              <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between z-10">
                <h2 className="text-xl font-semibold">
                  {editingPost ? "Edit Post" : "New Post"}
                </h2>
                <button onClick={() => setShowPostModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handlePostSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main Content */}
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Title *</label>
                      <input
                        type="text"
                        value={postForm.title}
                        onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded"
                        placeholder="Enter post title"
                        required
                        data-testid="post-title-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Slug</label>
                      <input
                        type="text"
                        value={postForm.slug}
                        onChange={(e) => setPostForm({ ...postForm, slug: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded"
                        placeholder="url-friendly-slug (auto-generated if empty)"
                        data-testid="post-slug-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Content *</label>
                      <div data-color-mode="light">
                        <MDEditor
                          value={postForm.content}
                          onChange={(value) => setPostForm({ ...postForm, content: value || "" })}
                          height={400}
                          preview="edit"
                          data-testid="post-content-editor"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Excerpt</label>
                      <textarea
                        value={postForm.excerpt}
                        onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                        placeholder="Brief summary (auto-generated from content if empty)"
                        data-testid="post-excerpt-input"
                      />
                    </div>
                  </div>

                  {/* Sidebar */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Status</label>
                      <select
                        value={postForm.status}
                        onChange={(e) => setPostForm({ ...postForm, status: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                        data-testid="post-status-select"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Category</label>
                      <select
                        value={postForm.category_id}
                        onChange={(e) => setPostForm({ ...postForm, category_id: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                        data-testid="post-category-select"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Tags</label>
                      <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded max-h-32 overflow-y-auto">
                        {tags.map(tag => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              postForm.tag_ids.includes(tag.id)
                                ? "bg-[#2563EB] text-white border-[#2563EB]"
                                : "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300"
                            }`}
                            data-testid={`toggle-tag-${tag.id}`}
                          >
                            {tag.name}
                          </button>
                        ))}
                        {tags.length === 0 && (
                          <p className="text-gray-400 text-xs">No tags available</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Featured Image</label>
                      {postForm.featured_image ? (
                        <div className="relative">
                          <img src={postForm.featured_image} alt="" className="w-full h-32 object-cover rounded" />
                          <button
                            type="button"
                            onClick={() => setPostForm({ ...postForm, featured_image: "" })}
                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <label className="block w-full p-8 border-2 border-dashed border-gray-200 rounded cursor-pointer hover:border-gray-300 text-center">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            data-testid="post-image-upload"
                          />
                          {uploading ? (
                            <span className="text-gray-500">Uploading...</span>
                          ) : (
                            <>
                              <Plus size={24} className="mx-auto text-gray-400 mb-2" />
                              <span className="text-gray-500 text-sm">Click to upload</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* SEO Fields Toggle */}
                <div className="border-t border-gray-100 pt-6">
                  <button
                    type="button"
                    onClick={() => setShowSEOFields(!showSEOFields)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                    data-testid="toggle-seo-fields"
                  >
                    <ChevronDown size={16} className={`transform transition-transform ${showSEOFields ? 'rotate-180' : ''}`} />
                    SEO Settings
                  </button>

                  {showSEOFields && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Meta Title</label>
                        <input
                          type="text"
                          value={postForm.meta_title}
                          onChange={(e) => setPostForm({ ...postForm, meta_title: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded"
                          placeholder="Max 60 characters"
                          maxLength={60}
                          data-testid="post-meta-title"
                        />
                        <p className="text-xs text-gray-400 mt-1">{postForm.meta_title.length}/60</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Canonical URL</label>
                        <input
                          type="url"
                          value={postForm.canonical_url}
                          onChange={(e) => setPostForm({ ...postForm, canonical_url: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded"
                          placeholder="https://..."
                          data-testid="post-canonical-url"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium mb-2">Meta Description</label>
                        <textarea
                          value={postForm.meta_description}
                          onChange={(e) => setPostForm({ ...postForm, meta_description: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                          placeholder="Max 160 characters"
                          maxLength={160}
                          data-testid="post-meta-description"
                        />
                        <p className="text-xs text-gray-400 mt-1">{postForm.meta_description.length}/160</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">OG Title</label>
                        <input
                          type="text"
                          value={postForm.og_title}
                          onChange={(e) => setPostForm({ ...postForm, og_title: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded"
                          placeholder="Social media title"
                          data-testid="post-og-title"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">OG Image URL</label>
                        <input
                          type="url"
                          value={postForm.og_image}
                          onChange={(e) => setPostForm({ ...postForm, og_image: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded"
                          placeholder="Social media image URL"
                          data-testid="post-og-image"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium mb-2">OG Description</label>
                        <textarea
                          value={postForm.og_description}
                          onChange={(e) => setPostForm({ ...postForm, og_description: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                          placeholder="Social media description"
                          data-testid="post-og-description"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setShowPostModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1" data-testid="save-post-btn">
                    {editingPost ? "Update Post" : "Create Post"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Category Modal */}
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="category-modal">
            <div className="bg-white w-full max-w-md rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingCategory ? "Edit Category" : "Add Category"}
                </h2>
                <button onClick={() => setShowCategoryModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCategorySubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="e.g., Industry News"
                    required
                    data-testid="category-name-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Slug</label>
                  <input
                    type="text"
                    value={categoryForm.slug}
                    onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="url-friendly-slug (auto-generated)"
                    data-testid="category-slug-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded h-20 resize-none"
                    placeholder="Brief category description"
                    data-testid="category-description-input"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowCategoryModal(false)} className="btn-secondary flex-1">
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

        {/* Tag Modal */}
        {showTagModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="tag-modal">
            <div className="bg-white w-full max-w-md rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Add Tag</h2>
                <button onClick={() => setShowTagModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleTagSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name *</label>
                  <input
                    type="text"
                    value={tagForm.name}
                    onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="e.g., Sustainable"
                    required
                    data-testid="tag-name-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Slug</label>
                  <input
                    type="text"
                    value={tagForm.slug}
                    onChange={(e) => setTagForm({ ...tagForm, slug: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="url-friendly-slug (auto-generated)"
                    data-testid="tag-slug-input"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowTagModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1" data-testid="save-tag-btn">
                    Create Tag
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

export default AdminBlog;
