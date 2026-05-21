import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { VendorAuthProvider } from "./context/VendorAuthContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { AgentAuthProvider } from "./context/AgentAuthContext";
import { BrandAuthProvider } from "./context/BrandAuthContext";
import { BrandCartProvider } from "./context/BrandCartContext";
import { ConfirmProvider } from "./components/useConfirm";
import WhatsAppChat from "./components/WhatsAppChat";
import { useEffect, lazy, Suspense } from "react";

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  
  return null;
}

// Global self-referencing canonical tag — prevents duplicate content issues.
// Strips query params, trailing slashes, and normalizes to https://locofast.com
// Handles known duplicate routes (e.g. /sell → /suppliers)
function CanonicalTag() {
  const { pathname } = useLocation();
  useEffect(() => {
    let clean = pathname.replace(/\/+$/, '') || '/';
    // Normalize known duplicates to a single canonical
    const canonicalMap = {
      '/sell': '/suppliers',
    };
    clean = canonicalMap[clean] || clean;
    const canonical = `https://locofast.com${clean}`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);
  }, [pathname]);
  return null;
}

// Minimal loading fallback
const PageLoader = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
  </div>
);

// =====================================================================
// CRITICAL PATH — loaded eagerly (needed on first paint)
// =====================================================================
import HomePage from "./pages/HomePage";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// =====================================================================
// LAZY-LOADED ROUTES — code-split into separate chunks
// =====================================================================

// Public pages
const FabricsPage = lazy(() => import("./pages/FabricsPage"));
const FabricDetailPage = lazy(() => import("./pages/FabricDetailPage"));
const CollectionsPage = lazy(() => import("./pages/CollectionsPage"));
const CollectionDetailPage = lazy(() => import("./pages/CollectionDetailPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const MediaPage = lazy(() => import("./pages/MediaPage"));
const CareersPage = lazy(() => import("./pages/CareersPage"));
const AssistedSourcingPage = lazy(() => import("./pages/AssistedSourcingPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderConfirmationPage = lazy(() => import("./pages/OrderConfirmationPage"));
const SellOnLocofast = lazy(() => import("./pages/SellOnLocofast"));
const RFQPage = lazy(() => import("./pages/RFQPage"));
const SupplierDetailPage = lazy(() => import("./pages/SupplierDetailPage"));
const SupplierProfilePage = lazy(() => import("./pages/SupplierProfilePage"));
const CustomerAccountPage = lazy(() => import("./pages/CustomerAccountPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const LoginPreview = lazy(() => import("./pages/LoginPreview"));
const CustomerQueryDetail = lazy(() => import("./pages/CustomerQueryDetail"));
const SharedCartPage = lazy(() => import("./pages/SharedCartPage"));

// Agent pages
const AgentLoginPage = lazy(() => import("./pages/agent/AgentLoginPage"));
const AgentDashboardPage = lazy(() => import("./pages/agent/AgentDashboardPage"));

// Brand portal pages
const BrandLogin = lazy(() => import("./pages/brand/BrandLogin"));
const BrandResetPassword = lazy(() => import("./pages/brand/BrandResetPassword"));
const BrandFabrics = lazy(() => import("./pages/brand/BrandFabrics"));
const BrandFabricDetail = lazy(() => import("./pages/brand/BrandFabricDetail"));
const BrandAccount = lazy(() => import("./pages/brand/BrandAccount"));
const BrandUsers = lazy(() => import("./pages/brand/BrandUsers"));
const BrandOrders = lazy(() => import("./pages/brand/BrandOrders"));
const BrandCart = lazy(() => import("./pages/brand/BrandCart"));
const BrandFactories = lazy(() => import("./pages/brand/BrandFactories"));
const BrandAllocations = lazy(() => import("./pages/brand/BrandAllocations"));
const BrandQueries = lazy(() => import("./pages/brand/BrandQueries"));
const BrandQueryDetail = lazy(() => import("./pages/brand/BrandQueryDetail"));

// Vendor pages
const VendorLogin = lazy(() => import("./pages/vendor/VendorLogin"));
const VendorDashboard = lazy(() => import("./pages/vendor/VendorDashboard"));
const VendorInventory = lazy(() => import("./pages/vendor/VendorInventory"));
const VendorOrders = lazy(() => import("./pages/vendor/VendorOrders"));
const VendorRfqs = lazy(() => import("./pages/vendor/VendorRfqs"));
const VendorRfqDetail = lazy(() => import("./pages/vendor/VendorRfqDetail"));
const VendorProtectedRoute = lazy(() => import("./components/VendorProtectedRoute"));

// Tools pages
const ToolsPage = lazy(() => import("./pages/tools").then(m => ({ default: m.ToolsPage })));
const GSTCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.GSTCalculator })));
const ProfitMarginCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.ProfitMarginCalculator })));
const DiscountCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.DiscountCalculator })));
const GSMCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.GSMCalculator })));
const CBMCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.CBMCalculator })));
const VolumetricWeightCalculator = lazy(() => import("./pages/tools").then(m => ({ default: m.VolumetricWeightCalculator })));
const ProductDescriptionGenerator = lazy(() => import("./pages/tools").then(m => ({ default: m.ProductDescriptionGenerator })));
const ProductTitleGenerator = lazy(() => import("./pages/tools").then(m => ({ default: m.ProductTitleGenerator })));
const BarcodeGenerator = lazy(() => import("./pages/tools").then(m => ({ default: m.BarcodeGenerator })));

// Admin pages
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminFabrics = lazy(() => import("./pages/admin/AdminFabrics"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers"));
const AdminCollections = lazy(() => import("./pages/admin/AdminCollections"));
const AdminArticles = lazy(() => import("./pages/admin/AdminArticles"));
const AdminEnquiries = lazy(() => import("./pages/admin/AdminEnquiries"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminRFQ = lazy(() => import("./pages/admin/AdminRFQ"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminFabricSEO = lazy(() => import("./pages/admin/AdminFabricSEO"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog"));
const AdminSellerDetail = lazy(() => import("./pages/admin/AdminSellerDetail"));
const AdminWatermarkPreview = lazy(() => import("./pages/admin/AdminWatermarkPreview"));
const AdminCreditApplications = lazy(() => import("./pages/admin/AdminCreditApplications"));
const AdminAgents = lazy(() => import("./pages/admin/AdminAgents"));
const AdminCommission = lazy(() => import("./pages/admin/AdminCommission"));
const AdminBrands = lazy(() => import("./pages/admin/AdminBrands"));
const AdminBrandFinancials = lazy(() => import("./pages/admin/AdminBrandFinancials"));
const AdminAccountManagers = lazy(() => import("./pages/admin/AdminAccountManagers"));
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute"));

// SEO Landing Pages
const FabricsHub = lazy(() => import("./pages/seo/FabricsHub"));
const DenimCategory = lazy(() => import("./pages/seo/denim/DenimCategory"));
const Denim8oz = lazy(() => import("./pages/seo/denim/Denim8oz"));
const Denim10oz = lazy(() => import("./pages/seo/denim/Denim10oz"));
const Denim12oz = lazy(() => import("./pages/seo/denim/Denim12oz"));
const DenimStretch = lazy(() => import("./pages/seo/denim/DenimStretch"));
const DenimRigid = lazy(() => import("./pages/seo/denim/DenimRigid"));
const DenimIndigoDyed = lazy(() => import("./pages/seo/denim/DenimIndigoDyed"));
const DenimForJeans = lazy(() => import("./pages/seo/denim/DenimForJeans"));
const DenimBulkSuppliers = lazy(() => import("./pages/seo/denim/DenimBulkSuppliers"));
const DenimManufacturers = lazy(() => import("./pages/seo/denim/DenimManufacturers"));
const PolyKnitCategory = lazy(() => import("./pages/seo/poly-knit/PolyKnitCategory"));
const PolyKnit180gsm = lazy(() => import("./pages/seo/poly-knit/PolyKnit180gsm"));
const PolyKnit220gsm = lazy(() => import("./pages/seo/poly-knit/PolyKnit220gsm"));
const PolyKnit240gsm = lazy(() => import("./pages/seo/poly-knit/PolyKnit240gsm"));
const PolyKnitInterlock = lazy(() => import("./pages/seo/poly-knit/PolyKnitInterlock"));
const PolyKnitJersey = lazy(() => import("./pages/seo/poly-knit/PolyKnitJersey"));
const PolyKnitMoistureWicking = lazy(() => import("./pages/seo/poly-knit/PolyKnitMoistureWicking"));
const PolyKnitSportswear = lazy(() => import("./pages/seo/poly-knit/PolyKnitSportswear"));
const PolyKnitBulkSuppliers = lazy(() => import("./pages/seo/poly-knit/PolyKnitBulkSuppliers"));
const PolyKnitManufacturers = lazy(() => import("./pages/seo/poly-knit/PolyKnitManufacturers"));

function App() {
  return (
    <HelmetProvider>
    <ConfirmProvider>
    <CustomerAuthProvider>
    <AgentAuthProvider>
    <BrandAuthProvider>
    <BrandCartProvider>
    <VendorAuthProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <ScrollToTop />
          <CanonicalTag />
          <Suspense fallback={<PageLoader />}>
          <Routes>
          {/* Public routes */}
          <Route path="/" element={<><Navbar /><HomePage /><Footer /></>} />
          <Route path="/fabrics" element={<FabricsPage />} />
          <Route path="/fabrics/:id" element={<FabricDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/inventory" element={<Navigate to="/fabrics" replace />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/about-us" element={<><Navbar /><AboutPage /><Footer /></>} />
          <Route path="/how-it-works" element={<><Navbar /><HowItWorksPage /><Footer /></>} />
          <Route path="/contact" element={<><Navbar /><ContactPage /><Footer /></>} />
          <Route path="/faq" element={<><Navbar /><FAQPage /><Footer /></>} />
          <Route path="/privacy" element={<><Navbar /><PrivacyPage /><Footer /></>} />
          <Route path="/terms" element={<><Navbar /><TermsPage /><Footer /></>} />
          <Route path="/customers" element={<><Navbar /><CustomersPage /><Footer /></>} />
          <Route path="/suppliers" element={<SellOnLocofast />} />
          <Route path="/suppliers/:category/:city/:slug/*" element={<SupplierProfilePage />} />
          <Route path="/suppliers/:category/:state/*" element={<SupplierDetailPage />} />
          <Route path="/sell" element={<SellOnLocofast />} />
          <Route path="/media" element={<><Navbar /><MediaPage /><Footer /></>} />
          <Route path="/careers" element={<><Navbar /><CareersPage /><Footer /></>} />
          <Route path="/assisted-sourcing" element={<AssistedSourcingPage />} />
          <Route path="/rfq" element={<RFQPage />} />
          <Route path="/request-quote" element={<RFQPage />} />
          
          {/* Customer Account */}
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="/dev/login-preview" element={<Suspense fallback={<PageLoader />}><LoginPreview /></Suspense>} />
          <Route path="/account/queries/:rfqId" element={<Suspense fallback={<PageLoader />}><CustomerQueryDetail /></Suspense>} />
          <Route path="/account/orders/:orderId" element={<Suspense fallback={<PageLoader />}><OrderDetailPage /></Suspense>} />
          
          {/* Shared Cart (customer-facing) */}
          <Route path="/shared-cart/:token" element={<SharedCartPage />} />
          
          {/* Agent routes */}
          <Route path="/agent/login" element={<AgentLoginPage />} />
          <Route path="/agent" element={<AgentDashboardPage />} />
          
          {/* Blog routes */}
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          
          {/* Checkout & Order routes */}
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
          
          {/* Seller Acquisition Landing Page */}
          <Route path="/sell" element={<SellOnLocofast />} />
          
          {/* Tools routes - SEO friendly individual pages */}
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/gst-calculator" element={<GSTCalculator />} />
          <Route path="/tools/profit-margin-calculator" element={<ProfitMarginCalculator />} />
          <Route path="/tools/discount-calculator" element={<DiscountCalculator />} />
          <Route path="/tools/gsm-calculator" element={<GSMCalculator />} />
          <Route path="/tools/cbm-calculator" element={<CBMCalculator />} />
          <Route path="/tools/volumetric-weight-calculator" element={<VolumetricWeightCalculator />} />
          <Route path="/tools/product-description-generator" element={<ProductDescriptionGenerator />} />
          <Route path="/tools/product-title-generator" element={<ProductTitleGenerator />} />
          <Route path="/tools/barcode-generator" element={<BarcodeGenerator />} />
          
          {/* SEO Landing Pages - Fabrics */}
          <Route path="/fabrics-info/" element={<FabricsHub />} />
          
          {/* Denim SEO Pages */}
          <Route path="/fabrics/denim/" element={<DenimCategory />} />
          <Route path="/fabrics/denim/8-oz/" element={<Denim8oz />} />
          <Route path="/fabrics/denim/10-oz/" element={<Denim10oz />} />
          <Route path="/fabrics/denim/12-oz/" element={<Denim12oz />} />
          <Route path="/fabrics/denim/stretch/" element={<DenimStretch />} />
          <Route path="/fabrics/denim/rigid/" element={<DenimRigid />} />
          <Route path="/fabrics/denim/indigo-dyed/" element={<DenimIndigoDyed />} />
          <Route path="/fabrics/denim/for-jeans-manufacturers/" element={<DenimForJeans />} />
          <Route path="/fabrics/denim/bulk-suppliers-india/" element={<DenimBulkSuppliers />} />
          <Route path="/fabrics/denim/denim-fabric-manufacturers-in-india/" element={<DenimManufacturers />} />
          
          {/* Poly Knit SEO Pages */}
          <Route path="/fabrics/poly-knit-fabrics/" element={<PolyKnitCategory />} />
          <Route path="/fabrics/poly-knit-fabrics/180-gsm/" element={<PolyKnit180gsm />} />
          <Route path="/fabrics/poly-knit-fabrics/220-gsm/" element={<PolyKnit220gsm />} />
          <Route path="/fabrics/poly-knit-fabrics/240-gsm/" element={<PolyKnit240gsm />} />
          <Route path="/fabrics/poly-knit-fabrics/interlock/" element={<PolyKnitInterlock />} />
          <Route path="/fabrics/poly-knit-fabrics/jersey/" element={<PolyKnitJersey />} />
          <Route path="/fabrics/poly-knit-fabrics/moisture-wicking/" element={<PolyKnitMoistureWicking />} />
          <Route path="/fabrics/poly-knit-fabrics/for-sportswear/" element={<PolyKnitSportswear />} />
          <Route path="/fabrics/poly-knit-fabrics/bulk-suppliers-india/" element={<PolyKnitBulkSuppliers />} />
          <Route path="/fabrics/poly-knit-fabrics/polyester-knit-fabric-manufacturers-in-india/" element={<PolyKnitManufacturers />} />
          
          {/* Admin routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/fabrics" element={<ProtectedRoute><AdminFabrics /></ProtectedRoute>} />
          <Route path="/admin/categories" element={<ProtectedRoute><AdminCategories /></ProtectedRoute>} />
          <Route path="/admin/sellers" element={<ProtectedRoute><AdminSellers /></ProtectedRoute>} />
          <Route path="/admin/sellers/:id" element={<ProtectedRoute><AdminSellerDetail /></ProtectedRoute>} />
          <Route path="/admin/watermark-preview" element={<ProtectedRoute><AdminWatermarkPreview /></ProtectedRoute>} />
          <Route path="/admin/collections" element={<ProtectedRoute><AdminCollections /></ProtectedRoute>} />
          <Route path="/admin/articles" element={<ProtectedRoute><AdminArticles /></ProtectedRoute>} />
          <Route path="/admin/enquiries" element={<ProtectedRoute><AdminEnquiries /></ProtectedRoute>} />
          <Route path="/admin/customers" element={<ProtectedRoute><AdminCustomers /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
          <Route path="/admin/rfq" element={<ProtectedRoute><AdminRFQ /></ProtectedRoute>} />
          <Route path="/admin/coupons" element={<ProtectedRoute><AdminCoupons /></ProtectedRoute>} />
          <Route path="/admin/reviews" element={<ProtectedRoute><AdminReviews /></ProtectedRoute>} />
          <Route path="/admin/seo" element={<ProtectedRoute><AdminFabricSEO /></ProtectedRoute>} />
          <Route path="/admin/blog" element={<ProtectedRoute><AdminBlog /></ProtectedRoute>} />
          <Route path="/admin/credit" element={<ProtectedRoute><AdminCreditApplications /></ProtectedRoute>} />
          <Route path="/admin/agents" element={<ProtectedRoute><AdminAgents /></ProtectedRoute>} />
          <Route path="/admin/commission" element={<ProtectedRoute><AdminCommission /></ProtectedRoute>} />
          <Route path="/admin/brands" element={<ProtectedRoute><AdminBrands /></ProtectedRoute>} />
          <Route path="/admin/brands/:brandId/financials" element={<ProtectedRoute><AdminBrandFinancials /></ProtectedRoute>} />
          <Route path="/admin/account-managers" element={<ProtectedRoute><AdminAccountManagers /></ProtectedRoute>} />

          {/* Enterprise Portal routes (Brands + Factories) — canonical /enterprise/*, with /brand/* kept as permanent redirects for backwards compat */}
          <Route path="/enterprise/login" element={<BrandLogin />} />
          <Route path="/enterprise/reset-password" element={<BrandResetPassword />} />
          <Route path="/enterprise/fabrics" element={<BrandFabrics />} />
          <Route path="/enterprise/fabrics/:id" element={<BrandFabricDetail />} />
          <Route path="/enterprise/account" element={<BrandAccount />} />
          <Route path="/enterprise/users" element={<BrandUsers />} />
          <Route path="/enterprise/orders" element={<BrandOrders />} />
          <Route path="/enterprise/cart" element={<BrandCart />} />
          <Route path="/enterprise/factories" element={<BrandFactories />} />
          <Route path="/enterprise/allocations" element={<BrandAllocations />} />
          <Route path="/enterprise/queries" element={<BrandQueries />} />
          <Route path="/enterprise/queries/:rfqId" element={<BrandQueryDetail />} />
          <Route path="/enterprise" element={<Navigate to="/enterprise/fabrics" replace />} />

          {/* Legacy /brand/* → /enterprise/* (permanent) */}
          <Route path="/brand/login" element={<Navigate to="/enterprise/login" replace />} />
          <Route path="/brand/reset-password" element={<Navigate to="/enterprise/reset-password" replace />} />
          <Route path="/brand/fabrics" element={<Navigate to="/enterprise/fabrics" replace />} />
          <Route path="/brand/fabrics/:id" element={<BrandFabricDetail />} />
          <Route path="/brand/account" element={<Navigate to="/enterprise/account" replace />} />
          <Route path="/brand/users" element={<Navigate to="/enterprise/users" replace />} />
          <Route path="/brand/orders" element={<Navigate to="/enterprise/orders" replace />} />
          <Route path="/brand/cart" element={<Navigate to="/enterprise/cart" replace />} />
          <Route path="/brand" element={<Navigate to="/enterprise/fabrics" replace />} />

          {/* Vendor routes */}
          <Route path="/vendor/login" element={<VendorLogin />} />
          <Route path="/vendor" element={<Suspense fallback={<PageLoader />}><VendorProtectedRoute><VendorDashboard /></VendorProtectedRoute></Suspense>} />
          <Route path="/vendor/inventory" element={<Suspense fallback={<PageLoader />}><VendorProtectedRoute><VendorInventory /></VendorProtectedRoute></Suspense>} />
          <Route path="/vendor/orders" element={<Suspense fallback={<PageLoader />}><VendorProtectedRoute><VendorOrders /></VendorProtectedRoute></Suspense>} />
          <Route path="/vendor/rfqs" element={<Suspense fallback={<PageLoader />}><VendorProtectedRoute><VendorRfqs /></VendorProtectedRoute></Suspense>} />
          <Route path="/vendor/rfqs/:rfqId" element={<Suspense fallback={<PageLoader />}><VendorProtectedRoute><VendorRfqDetail /></VendorProtectedRoute></Suspense>} />
        </Routes>
        </Suspense>
        <WhatsAppChat />
      </BrowserRouter>
    </AuthProvider>
    </VendorAuthProvider>
    </BrandCartProvider>
    </BrandAuthProvider>
    </AgentAuthProvider>
    </CustomerAuthProvider>
    </ConfirmProvider>
    </HelmetProvider>
  );
}

export default App;
