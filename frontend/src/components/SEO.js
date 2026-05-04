import { Helmet } from 'react-helmet-async';

const DEFAULT_SITE_NAME = 'Locofast';
const DEFAULT_SITE_URL = 'https://locofast.com';
const DEFAULT_OG_IMAGE = 'https://locofast.com/og-image.jpg';

/**
 * SEO Component for dynamic meta tags
 * Used across all pages for proper SEO optimization
 */
const SEO = ({
  title,
  description,
  keywords,
  canonicalUrl,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt,
  noIndex = false,
  structuredData,
  children
}) => {
  // Build full title with site name
  const fullTitle = title 
    ? `${title} | ${DEFAULT_SITE_NAME}` 
    : `${DEFAULT_SITE_NAME} - Premium Fabric Sourcing for Fashion Brands`;
  
  // Default description if none provided
  const metaDescription = description || 
    'Source quality fabrics from verified Indian mills. Transparent pricing, MOQ clarity, and fast delivery for fashion brands, designers, and manufacturers.';
  
  // Build canonical URL
  const canonical = canonicalUrl 
    ? (canonicalUrl.startsWith('http') ? canonicalUrl : `${DEFAULT_SITE_URL}${canonicalUrl}`)
    : null;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={metaDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      
      {/* Robots */}
      <meta name="robots" content={noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'} />
      
      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={ogImage} />
      {ogImageAlt && <meta property="og:image:alt" content={ogImageAlt} />}
      <meta property="og:site_name" content={DEFAULT_SITE_NAME} />
      <meta property="og:locale" content="en_IN" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      {canonical && <meta name="twitter:url" content={canonical} />}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImage} />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
      
      {children}
    </Helmet>
  );
};

/**
 * Product Schema for fabric pages
 */
export const createFabricSchema = (fabric) => {
  if (!fabric) return null;
  
  const baseUrl = DEFAULT_SITE_URL;
  
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": fabric.name,
    "description": fabric.description || `${fabric.name} - ${fabric.category_name} fabric available for bulk sourcing`,
    "image": fabric.images?.[0] || DEFAULT_OG_IMAGE,
    "url": `${baseUrl}/fabrics/${fabric.id}`,
    // Brand/manufacturer obfuscated by design — vendor identities are not
    // exposed publicly. Search engines see the marketplace as the canonical
    // source; admins/agents see seller_code internally.
    "brand": {
      "@type": "Brand",
      "name": "Locofast Verified Supplier"
    },
    "manufacturer": {
      "@type": "Organization",
      "name": "Locofast Verified Mills"
    },
    "category": fabric.category_name,
    ...(fabric.rate_per_meter && {
      "offers": {
        "@type": "Offer",
        "priceCurrency": "INR",
        "price": fabric.rate_per_meter,
        "priceValidUntil": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        "availability": fabric.quantity_available > 0 
          ? "https://schema.org/InStock" 
          : "https://schema.org/PreOrder",
        "seller": {
          "@type": "Organization",
          "name": "Locofast"
        }
      }
    }),
    "additionalProperty": [
      fabric.gsm && { "@type": "PropertyValue", "name": "GSM", "value": fabric.gsm },
      fabric.width && { "@type": "PropertyValue", "name": "Width", "value": fabric.width },
      fabric.fabric_type && { "@type": "PropertyValue", "name": "Fabric Type", "value": fabric.fabric_type },
      fabric.color && { "@type": "PropertyValue", "name": "Color", "value": fabric.color }
    ].filter(Boolean)
  };
};

/**
 * Blog Article Schema
 */
export const createBlogSchema = (post) => {
  if (!post) return null;
  
  const baseUrl = DEFAULT_SITE_URL;
  
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt || post.meta_description,
    "image": post.cover_image || DEFAULT_OG_IMAGE,
    "url": `${baseUrl}/blog/${post.slug}`,
    "datePublished": post.created_at,
    "dateModified": post.updated_at || post.created_at,
    "author": {
      "@type": "Organization",
      "name": "Locofast"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Locofast",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${baseUrl}/blog/${post.slug}`
    }
  };
};

/**
 * BreadcrumbList Schema
 */
export const createBreadcrumbSchema = (items) => {
  const baseUrl = DEFAULT_SITE_URL;
  
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`
    }))
  };
};

/**
 * FAQ Schema for pages with FAQ sections
 */
export const createFAQSchema = (faqs) => {
  if (!faqs || faqs.length === 0) return null;
  
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };
};

/**
 * Collection/ItemList Schema
 */
export const createCollectionSchema = (collection, fabrics = []) => {
  if (!collection) return null;
  
  const baseUrl = DEFAULT_SITE_URL;
  
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": collection.name,
    "description": collection.description,
    "url": `${baseUrl}/collections/${collection.id}`,
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": fabrics.length,
      "itemListElement": fabrics.slice(0, 10).map((fabric, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "Product",
          "name": fabric.name,
          "url": `${baseUrl}/fabrics/${fabric.id}`
        }
      }))
    }
  };
};

export default SEO;
