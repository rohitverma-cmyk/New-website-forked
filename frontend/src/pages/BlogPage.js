import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Calendar, User, Tag, ArrowRight, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getBlogPosts, getBlogPostsCount, getBlogCategories, getBlogTags } from "../lib/api";

const POSTS_PER_PAGE = 9;

const BlogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const currentPage = parseInt(searchParams.get("page") || "1");
  const categorySlug = searchParams.get("category");
  const tagSlug = searchParams.get("tag");
  const searchQuery = searchParams.get("search") || "";

  useEffect(() => {
    fetchData();
  }, [currentPage, categorySlug, tagSlug, searchQuery]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        status: "published",
        limit: POSTS_PER_PAGE,
        skip: (currentPage - 1) * POSTS_PER_PAGE
      };
      
      if (categorySlug) params.category_slug = categorySlug;
      if (tagSlug) params.tag_slug = tagSlug;
      if (searchQuery) params.search = searchQuery;

      const [postsRes, countRes, catsRes, tagsRes] = await Promise.all([
        getBlogPosts(params),
        getBlogPostsCount({ status: "published", category_slug: categorySlug, tag_slug: tagSlug }),
        getBlogCategories(),
        getBlogTags()
      ]);

      setPosts(postsRes.data);
      setTotalCount(countRes.data.count);
      setCategories(catsRes.data);
      setTags(tagsRes.data);
    } catch (err) {
      console.error("Failed to load blog:", err);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE);

  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const query = formData.get("search");
    const newParams = new URLSearchParams(searchParams);
    if (query) {
      newParams.set("search", query);
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const activeCategory = categories.find(c => c.slug === categorySlug);
  const activeTag = tags.find(t => t.slug === tagSlug);

  // SEO
  const pageTitle = activeCategory
    ? `${activeCategory.name} - Blog | Locofast`
    : activeTag
    ? `Posts tagged "${activeTag.name}" | Locofast Blog`
    : "Blog | Locofast - Fabric Sourcing Insights";
  
  const pageDescription = activeCategory
    ? `Read our latest articles about ${activeCategory.name}. Industry insights, sourcing guides, and textile news.`
    : "Industry insights, sourcing guides, and textile news from Locofast. Stay updated with the latest in fabric and apparel manufacturing.";

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://locofast.com/blog" />
        
        {/* Blog structured data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "Locofast Blog",
            "description": pageDescription,
            "url": `${window.location.origin}/blog`,
            "publisher": {
              "@type": "Organization",
              "name": "Locofast",
              "logo": {
                "@type": "ImageObject",
                "url": "https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg"
              }
            }
          })}
        </script>
      </Helmet>

      <Navbar />
      
      <main className="min-h-screen bg-gray-50" data-testid="blog-page">
        {/* Hero Section */}
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-gray-900 mb-4" data-testid="blog-title">
                {activeCategory ? activeCategory.name : activeTag ? `Tagged: ${activeTag.name}` : "Blog"}
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                {activeCategory?.description || "Industry insights, sourcing guides, and textile news"}
              </p>
              
              {/* Search */}
              <form onSubmit={handleSearch} className="max-w-xl mx-auto">
                <div className="relative">
                  <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    name="search"
                    defaultValue={searchQuery}
                    placeholder="Search articles..."
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                    data-testid="blog-search"
                  />
                </div>
              </form>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Main Content */}
            <div className="flex-1">
              {/* Active Filters */}
              {(categorySlug || tagSlug || searchQuery) && (
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  <span className="text-sm text-gray-500">Filters:</span>
                  {activeCategory && (
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                      Category: {activeCategory.name}
                    </span>
                  )}
                  {activeTag && (
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                      Tag: {activeTag.name}
                    </span>
                  )}
                  {searchQuery && (
                    <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                      Search: "{searchQuery}"
                    </span>
                  )}
                  <button onClick={clearFilters} className="text-sm text-red-600 hover:underline ml-2">
                    Clear all
                  </button>
                </div>
              )}

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-lg overflow-hidden shadow-sm animate-pulse">
                      <div className="h-48 bg-gray-200" />
                      <div className="p-6">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-3" />
                        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-lg">
                  <p className="text-gray-500 text-lg mb-4">No posts found</p>
                  {(categorySlug || tagSlug || searchQuery) && (
                    <button onClick={clearFilters} className="btn-primary">
                      View all posts
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Posts Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="blog-posts-grid">
                    {posts.map((post) => (
                      <article key={post.id} className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow" data-testid={`blog-post-${post.slug}`}>
                        <Link to={`/blog/${post.slug}`}>
                          {post.featured_image ? (
                            <img
                              src={post.featured_image}
                              alt={post.title}
                              className="w-full h-48 object-cover"
                            />
                          ) : (
                            <div className="w-full h-48 bg-gradient-to-br from-[#2563EB] to-blue-700 flex items-center justify-center">
                              <span className="text-white text-4xl font-bold opacity-30">
                                {post.title.charAt(0)}
                              </span>
                            </div>
                          )}
                        </Link>
                        <div className="p-6">
                          <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                            {post.category_name && (
                              <Link
                                to={`/blog?category=${post.category_slug}`}
                                className="text-[#2563EB] hover:underline"
                              >
                                {post.category_name}
                              </Link>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <Link to={`/blog/${post.slug}`}>
                            <h2 className="text-xl font-semibold text-gray-900 mb-2 hover:text-[#2563EB] transition-colors line-clamp-2">
                              {post.title}
                            </h2>
                          </Link>
                          <p className="text-gray-600 line-clamp-3 mb-4">
                            {post.excerpt}
                          </p>
                          <Link
                            to={`/blog/${post.slug}`}
                            className="inline-flex items-center gap-2 text-[#2563EB] font-medium hover:gap-3 transition-all"
                          >
                            Read more <ArrowRight size={16} />
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-12" data-testid="blog-pagination">
                      <button
                        onClick={() => {
                          const newParams = new URLSearchParams(searchParams);
                          newParams.set("page", String(currentPage - 1));
                          setSearchParams(newParams);
                        }}
                        disabled={currentPage === 1}
                        className="p-2 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      
                      {[...Array(totalPages)].map((_, i) => {
                        const page = i + 1;
                        // Show first, last, current, and adjacent pages
                        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                          return (
                            <button
                              key={page}
                              onClick={() => {
                                const newParams = new URLSearchParams(searchParams);
                                newParams.set("page", String(page));
                                setSearchParams(newParams);
                              }}
                              className={`w-10 h-10 rounded border ${
                                page === currentPage
                                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                                  : "border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              {page}
                            </button>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2">...</span>;
                        }
                        return null;
                      })}
                      
                      <button
                        onClick={() => {
                          const newParams = new URLSearchParams(searchParams);
                          newParams.set("page", String(currentPage + 1));
                          setSearchParams(newParams);
                        }}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:w-80 space-y-8">
              {/* Categories */}
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-lg mb-4">Categories</h3>
                {categories.length > 0 ? (
                  <ul className="space-y-2">
                    {categories.map((cat) => (
                      <li key={cat.id}>
                        <Link
                          to={`/blog?category=${cat.slug}`}
                          className={`flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50 transition-colors ${
                            categorySlug === cat.slug ? "bg-blue-50 text-[#2563EB]" : "text-gray-600"
                          }`}
                        >
                          <span>{cat.name}</span>
                          <span className="text-sm text-gray-400">{cat.post_count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm">No categories yet</p>
                )}
              </div>

              {/* Tags */}
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-lg mb-4">Popular Tags</h3>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.slice(0, 15).map((tag) => (
                      <Link
                        key={tag.id}
                        to={`/blog?tag=${tag.slug}`}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-colors ${
                          tagSlug === tag.slug
                            ? "bg-[#2563EB] text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        <Tag size={12} />
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No tags yet</p>
                )}
              </div>

              {/* CTA */}
              <div className="bg-gradient-to-br from-[#2563EB] to-blue-700 rounded-lg p-6 text-white">
                <h3 className="font-semibold text-lg mb-2">Need Fabric?</h3>
                <p className="text-blue-100 text-sm mb-4">
                  Browse our extensive catalog of fabrics from verified suppliers.
                </p>
                <Link
                  to="/fabrics"
                  className="inline-block bg-white text-[#2563EB] px-4 py-2 rounded font-medium hover:bg-blue-50 transition-colors"
                >
                  Instant Booking
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default BlogPage;
