import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Package, ArrowRight, ArrowLeft } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getCollections } from "../lib/api";

const CollectionsPage = () => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const res = await getCollections();
        setCollections(res.data);
      } catch (err) {
        console.error("Failed to fetch collections");
      }
      setLoading(false);
    };
    fetchCollections();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Helmet>
        <title>Fabric Collections - Curated Selections for Fashion | Locofast</title>
        <meta name="description" content="Explore curated fabric collections organized by occasion, season, and application. Premium textiles for fashion brands, designers, and manufacturers. Sample orders available." />
        <meta property="og:title" content="Fabric Collections - Curated Selections for Fashion | Locofast" />
        <meta property="og:description" content="Explore curated fabric collections organized by occasion, season, and application. Premium textiles for fashion brands." />
        <link rel="canonical" href="https://locofast.com/collections" />
      </Helmet>
      <Navbar />
      <main className="flex-grow pt-20">
        {/* Header */}
        <section className="bg-white border-b border-gray-100">
          <div className="container-main py-16">
            <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
              <ArrowLeft size={16} />
              Back to Home
            </Link>
            <p className="text-xs tracking-widest text-[#2563EB] font-medium mb-4">CURATED SELECTIONS</p>
            <h1 className="text-4xl md:text-5xl font-serif mb-4">Collections</h1>
            <p className="text-gray-600 max-w-2xl">
              Explore our curated fabric collections, organized by occasion, season, and application. 
              Each collection brings together fabrics that work well together for specific purposes.
            </p>
          </div>
        </section>

        {/* Collections Grid */}
        <section className="container-main py-12">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : collections.length === 0 ? (
            <div className="text-center py-16">
              <Package size={64} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-medium text-gray-600 mb-2">No collections available</h3>
              <p className="text-gray-500 mb-6">Check back soon for curated fabric selections</p>
              <Link to="/fabrics" className="btn-primary inline-flex items-center gap-2">
                Browse All Fabrics
                <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" data-testid="collections-list">
              {collections.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/collections/${collection.id}`}
                  className="group bg-white rounded-lg overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300"
                  data-testid={`collection-item-${collection.id}`}
                >
                  {collection.image_url ? (
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={collection.image_url}
                        alt={collection.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                      <Package size={64} className="text-blue-200" />
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-[#2563EB] transition-colors">
                      {collection.name}
                    </h3>
                    {collection.description && (
                      <p className="text-gray-600 text-sm line-clamp-2 mb-4">{collection.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {collection.fabric_count} {collection.fabric_count === 1 ? 'fabric' : 'fabrics'}
                      </span>
                      <span className="text-[#2563EB] text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                        View Collection
                        <ArrowRight size={16} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CollectionsPage;
