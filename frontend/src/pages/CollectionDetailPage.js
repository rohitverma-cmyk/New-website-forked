import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getCollection, getCollectionFabrics } from "../lib/api";

const CollectionDetailPage = () => {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [collRes, fabRes] = await Promise.all([
          getCollection(id),
          getCollectionFabrics(id)
        ]);
        setCollection(collRes.data);
        setFabrics(fabRes.data);
      } catch (err) {
        console.error("Failed to fetch collection");
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const getCompositionString = (composition) => {
    if (Array.isArray(composition) && composition.length > 0) {
      return composition.map(c => `${c.percentage}% ${c.material}`).join(', ');
    }
    return composition || '-';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow pt-20 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow pt-20 flex items-center justify-center">
          <div className="text-center">
            <Package size={64} className="mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-medium text-gray-600 mb-4">Collection not found</h2>
            <Link to="/collections" className="btn-primary">
              Browse Collections
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-grow pt-20">
        {/* Hero */}
        {collection.image_url && collection.image_url.startsWith('http') && (
          <div className="relative h-64 md:h-80 lg:h-96 overflow-hidden">
            <img
              src={collection.image_url}
              alt={collection.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 container-main pb-8 text-white">
              <Link to="/collections" className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 text-sm">
                <ArrowLeft size={16} />
                All Collections
              </Link>
              <h1 className="text-3xl md:text-4xl font-serif">{collection.name}</h1>
              {collection.description && (
                <p className="mt-2 text-white/90 max-w-2xl">{collection.description}</p>
              )}
            </div>
          </div>
        )}

        {/* Header without image */}
        {(!collection.image_url || !collection.image_url.startsWith('http')) && (
          <section className="bg-white border-b border-gray-100">
            <div className="container-main py-8">
              <Link to="/collections" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
                <ArrowLeft size={16} />
                All Collections
              </Link>
              <h1 className="text-3xl md:text-4xl font-serif">{collection.name}</h1>
              {collection.description && (
                <p className="mt-2 text-gray-600 max-w-2xl">{collection.description}</p>
              )}
            </div>
          </section>
        )}

        {/* Fabrics Grid */}
        <section className="container-main py-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-medium">
              {fabrics.length} {fabrics.length === 1 ? 'Fabric' : 'Fabrics'} in this Collection
            </h2>
          </div>

          {fabrics.length === 0 ? (
            <div className="text-center py-16 bg-white rounded border border-gray-100">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No fabrics in this collection yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" data-testid="collection-fabrics-grid">
              {fabrics.map((fabric) => (
                <Link
                  key={fabric.id}
                  to={`/fabrics/${fabric.slug || fabric.id}`}
                  className="group bg-white rounded-lg overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
                  data-testid={`fabric-card-${fabric.id}`}
                >
                  <div className="aspect-square relative overflow-hidden bg-gray-100">
                    {fabric.images?.[0] ? (
                      <img
                        src={fabric.images[0]}
                        alt={fabric.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <Package size={32} className="text-gray-300" />
                      </div>
                    )}
                    {/* Availability badges */}
                    {fabric.availability && fabric.availability.length > 0 && (
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        {fabric.availability.map((avail, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 text-xs font-medium rounded ${
                              avail === 'Sample' ? 'bg-blue-500 text-white' :
                              avail === 'Bulk' ? 'bg-emerald-500 text-white' :
                              'bg-amber-500 text-white'
                            }`}
                          >
                            {avail}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1 group-hover:text-[#2563EB] transition-colors line-clamp-1">
                      {fabric.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">{getCompositionString(fabric.composition)}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{fabric.gsm} GSM</span>
                      <span className="text-[#2563EB] font-medium">{fabric.category_name}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="container-main pb-16">
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center">
            <h3 className="text-xl font-medium mb-2">Looking for something specific?</h3>
            <p className="text-gray-600 mb-6">Browse our complete catalog or get in touch with our team</p>
            <div className="flex justify-center gap-4">
              <Link to="/fabrics" className="btn-primary">Browse All Fabrics</Link>
              <Link to="/contact" className="btn-secondary">Contact Us</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CollectionDetailPage;
