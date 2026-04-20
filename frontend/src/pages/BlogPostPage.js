import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Calendar, Tag, ArrowLeft, Share2, Facebook, Twitter, Linkedin, Copy, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getBlogPostBySlug, getBlogPosts } from "../lib/api";

const BlogPostPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShareMenu, setShowShareMenu] = useState(false);

  useEffect(() => {
    fetchPost();
  }, [slug]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const res = await getBlogPostBySlug(slug);
      if (res.data.status !== 'published') {
        navigate('/blog');
        return;
      }
      setPost(res.data);
      
      // Fetch related posts from same category
      if (res.data.category_id) {
        const relatedRes = await getBlogPosts({
          status: 'published',
          category_id: res.data.category_id,
          limit: 3
        });
        setRelatedPosts(relatedRes.data.filter(p => p.id !== res.data.id).slice(0, 3));
      }
    } catch (err) {
      console.error("Failed to load post:", err);
      navigate('/blog');
    }
    setLoading(false);
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = post?.title || '';

  const handleShare = (platform) => {
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`,
      linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`,
    };
    
    if (platform === 'copy') {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
      setShowShareMenu(false);
      return;
    }
    
    window.open(urls[platform], '_blank', 'width=600,height=400');
    setShowShareMenu(false);
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-4">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-4" />
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-8" />
              <div className="h-96 bg-gray-200 rounded mb-8" />
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!post) return null;

  const publishDate = new Date(post.published_at || post.created_at);
  const formattedDate = publishDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Schema.org structured data
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.meta_description || post.excerpt,
    "image": post.featured_image || post.og_image,
    "datePublished": post.published_at || post.created_at,
    "dateModified": post.updated_at,
    "author": {
      "@type": "Organization",
      "name": "Locofast"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Locofast",
      "logo": {
        "@type": "ImageObject",
        "url": "https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": shareUrl
    }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": `${window.location.origin}/`
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Blog",
        "item": `${window.location.origin}/blog`
      },
      ...(post.category_name ? [{
        "@type": "ListItem",
        "position": 3,
        "name": post.category_name,
        "item": `${window.location.origin}/blog?category=${post.category_slug}`
      }] : []),
      {
        "@type": "ListItem",
        "position": post.category_name ? 4 : 3,
        "name": post.title,
        "item": shareUrl
      }
    ]
  };

  return (
    <>
      <Helmet>
        <title>{post.meta_title || post.title} | Locofast Blog</title>
        <meta name="description" content={post.meta_description || post.excerpt} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.og_title || post.title} />
        <meta property="og:description" content={post.og_description || post.excerpt} />
        {(post.og_image || post.featured_image) && (
          <meta property="og:image" content={post.og_image || post.featured_image} />
        )}
        <meta property="og:url" content={shareUrl} />
        <meta property="article:published_time" content={post.published_at || post.created_at} />
        <meta property="article:modified_time" content={post.updated_at} />
        {post.category_name && <meta property="article:section" content={post.category_name} />}
        {post.tags?.map(tag => (
          <meta key={tag.id} property="article:tag" content={tag.name} />
        ))}
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.og_title || post.title} />
        <meta name="twitter:description" content={post.og_description || post.excerpt} />
        {(post.og_image || post.featured_image) && (
          <meta name="twitter:image" content={post.og_image || post.featured_image} />
        )}
        
        {/* Canonical */}
        <link rel="canonical" href={post.canonical_url || `https://locofast.com/blog/${post.slug}`} />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(articleSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>

      <Navbar />
      
      <main className="min-h-screen bg-gray-50" data-testid="blog-post-page">
        <article>
          {/* Header */}
          <header className="bg-white border-b border-gray-100">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-gray-900">Home</Link>
                <ChevronRight size={14} />
                <Link to="/blog" className="hover:text-gray-900">Blog</Link>
                {post.category_name && (
                  <>
                    <ChevronRight size={14} />
                    <Link to={`/blog?category=${post.category_slug}`} className="hover:text-gray-900">
                      {post.category_name}
                    </Link>
                  </>
                )}
              </nav>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-gray-900 mb-4" data-testid="post-title">
                {post.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-gray-500">
                <span className="flex items-center gap-2">
                  <Calendar size={16} />
                  <time dateTime={post.published_at || post.created_at}>{formattedDate}</time>
                </span>
                
                {post.category_name && (
                  <Link
                    to={`/blog?category=${post.category_slug}`}
                    className="text-[#2563EB] hover:underline"
                  >
                    {post.category_name}
                  </Link>
                )}

                {/* Share Button */}
                <div className="relative ml-auto">
                  <button
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    data-testid="share-btn"
                  >
                    <Share2 size={16} />
                    Share
                  </button>
                  
                  {showShareMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg py-2 w-48 z-10">
                      <button
                        onClick={() => handleShare('facebook')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Facebook size={16} className="text-blue-600" />
                        Facebook
                      </button>
                      <button
                        onClick={() => handleShare('twitter')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Twitter size={16} className="text-sky-500" />
                        Twitter
                      </button>
                      <button
                        onClick={() => handleShare('linkedin')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Linkedin size={16} className="text-blue-700" />
                        LinkedIn
                      </button>
                      <hr className="my-2" />
                      <button
                        onClick={() => handleShare('copy')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Copy size={16} />
                        Copy link
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Featured Image */}
          {post.featured_image && (
            <div className="bg-white">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <img
                  src={post.featured_image}
                  alt={post.title}
                  className="w-full h-auto max-h-[500px] object-cover rounded-lg shadow-sm -mb-8 relative z-10"
                  data-testid="post-featured-image"
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 ${post.featured_image ? 'pt-16' : 'pt-8'} pb-12`}>
            <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
              {/* Excerpt */}
              {post.excerpt && (
                <p className="text-xl text-gray-600 mb-8 pb-8 border-b border-gray-100 leading-relaxed">
                  {post.excerpt}
                </p>
              )}

              {/* Main Content */}
              <div
                className="prose prose-lg max-w-none prose-headings:font-semibold prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-[#2563EB] prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg"
                dangerouslySetInnerHTML={{ __html: post.content }}
                data-testid="post-content"
              />

              {/* Tags */}
              {post.tags?.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-100">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-gray-500 text-sm">Tags:</span>
                    {post.tags.map((tag) => (
                      <Link
                        key={tag.id}
                        to={`/blog?tag=${tag.slug}`}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm hover:bg-gray-200 transition-colors"
                      >
                        <Tag size={12} />
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="bg-white border-t border-gray-100 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <article key={relatedPost.id} className="bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <Link to={`/blog/${relatedPost.slug}`}>
                      {relatedPost.featured_image ? (
                        <img
                          src={relatedPost.featured_image}
                          alt={relatedPost.title}
                          className="w-full h-40 object-cover"
                        />
                      ) : (
                        <div className="w-full h-40 bg-gradient-to-br from-[#2563EB] to-blue-700 flex items-center justify-center">
                          <span className="text-white text-3xl font-bold opacity-30">
                            {relatedPost.title.charAt(0)}
                          </span>
                        </div>
                      )}
                    </Link>
                    <div className="p-4">
                      <Link to={`/blog/${relatedPost.slug}`}>
                        <h3 className="font-semibold text-gray-900 hover:text-[#2563EB] transition-colors line-clamp-2">
                          {relatedPost.title}
                        </h3>
                      </Link>
                      <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                        {relatedPost.excerpt}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Back to Blog */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to all articles
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default BlogPostPage;
