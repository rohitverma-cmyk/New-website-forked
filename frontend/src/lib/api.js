import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  // Check for vendor token first (for /vendor/* and /cloudinary/* routes when vendor is logged in)
  const vendorToken = localStorage.getItem("vendor_token");
  if (config.url?.startsWith('/vendor') && !config.url?.includes('/vendor/login')) {
    if (vendorToken) {
      config.headers.Authorization = `Bearer ${vendorToken}`;
    }
  } else if (config.url?.includes('/cloudinary') && vendorToken && !localStorage.getItem("locofast_token")) {
    // Use vendor token for cloudinary uploads when only vendor is logged in
    config.headers.Authorization = `Bearer ${vendorToken}`;
  } else {
    // Admin token for other protected routes
    const token = localStorage.getItem("locofast_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if the failed request required auth
      // Don't redirect for public endpoints that happen to fail
      const requestUrl = error.config?.url || '';
      const authRequiredEndpoints = [
        '/auth/me',
        '/enquiries',
        '/stats',
        '/fabrics',
        '/categories',
        '/sellers',
        '/collections',
        '/articles',
        '/seo/',
        '/upload',
        '/coupons',
        '/orders',
        '/cloudinary'
      ];
      
      // Check if this was an auth-required endpoint
      const isAuthRequired = authRequiredEndpoints.some(endpoint => 
        requestUrl.includes(endpoint) && !requestUrl.includes('/blog/')
      );
      
      if (isAuthRequired) {
        localStorage.removeItem("locofast_token");
        localStorage.removeItem("locofast_admin");
        if (window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin/login") {
          window.location.href = "/admin/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => api.post("/auth/login", { email, password });
export const register = (email, password, name) => api.post("/auth/register", { email, password, name });
export const getMe = () => api.get("/auth/me");

// Categories
export const getCategories = () => api.get("/categories");
export const getCategory = (id) => api.get(`/categories/${id}`);
export const createCategory = (data) => api.post("/categories", data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Sellers
export const getSellers = (includeInactive = false) => api.get("/sellers", { params: { include_inactive: includeInactive } });
export const getSeller = (id) => api.get(`/sellers/${id}`);
export const createSeller = (data) => api.post("/sellers", data);
export const updateSeller = (id, data) => api.put(`/sellers/${id}`, data);
export const deleteSeller = (id) => api.delete(`/sellers/${id}`);

// Reviews
export const getReviews = (sellerId) => api.get("/reviews", { params: sellerId ? { seller_id: sellerId } : {} });
export const createReview = (data) => api.post("/reviews", data);
export const deleteReview = (id) => api.delete(`/reviews/${id}`);

// Fabrics
export const getFabrics = (params) => api.get("/fabrics", { params });
export const getFabricsCount = (params) => api.get("/fabrics/count", { params });
export const getFabricFilterOptions = () => api.get("/fabrics/filter-options");
export const getFabric = (id) => api.get(`/fabrics/${id}`);
export const createFabric = (data) => api.post("/fabrics", data);
export const updateFabric = (id, data) => api.put(`/fabrics/${id}`, data);
export const deleteFabric = (id) => api.delete(`/fabrics/${id}`);
export const approveFabric = (id) => api.put(`/fabrics/${id}`, { status: 'approved' });
export const rejectFabric = (id) => api.put(`/fabrics/${id}`, { status: 'rejected' });

// Credit / Wallet
export const applyForCredit = (data) => api.post("/credit/apply", data);
export const getCreditBalance = (email) => api.get("/credit/balance", { params: { email } });

// Customer Auth (OTP)
export const sendCustomerOTP = (email) => api.post("/customer/send-otp", { email });
export const verifyCustomerOTP = (email, otp) => api.post("/customer/verify-otp", { email, otp });
export const sendCustomerWhatsAppOTP = (phone) => api.post("/customer/send-whatsapp-otp", { phone });
export const verifyCustomerWhatsAppOTP = (phone, otp) => api.post("/customer/verify-whatsapp-otp", { phone, otp });
export const getCustomerProfile = (token) => api.get("/customer/profile", { headers: { Authorization: `Bearer ${token}` } });
export const updateCustomerProfile = (token, data) => api.put("/customer/profile", data, { headers: { Authorization: `Bearer ${token}` } });
export const getCustomerOrders = (token) => api.get("/customer/orders", { headers: { Authorization: `Bearer ${token}` } });
export const getCustomerOrder = (token, orderId) =>
  api.get(`/customer/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
export const getOrderPayContext = (token, orderId) =>
  api.get(`/customer/orders/${orderId}/pay-context`, { headers: { Authorization: `Bearer ${token}` } });
export const getOrderTracking = (token, orderId) =>
  api.get(`/customer/orders/${orderId}/tracking`, { headers: { Authorization: `Bearer ${token}` } });

// Customer Queries (RFQ pipeline)
export const getCustomerQueries = (token, status = "received") =>
  api.get(`/customer/queries?status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
export const getCustomerQueryDetail = (token, rfqId) =>
  api.get(`/customer/queries/${rfqId}`, { headers: { Authorization: `Bearer ${token}` } });
export const placeOrderFromQuote = (token, quoteId, payload) =>
  api.post(`/customer/queries/quotes/${quoteId}/place-order`, payload, { headers: { Authorization: `Bearer ${token}` } });


// Articles (Color Variant Grouping)
export const getArticles = (params) => api.get("/articles", { params });
export const getArticle = (id) => api.get(`/articles/${id}`);
export const getArticleVariants = (id) => api.get(`/articles/${id}/variants`);
export const createArticle = (data) => api.post("/articles", data);
export const updateArticle = (id, data) => api.put(`/articles/${id}`, data);
export const deleteArticle = (id) => api.delete(`/articles/${id}`);

// Enquiries
export const createEnquiry = (data) => api.post("/enquiries", data);
export const getEnquiries = () => api.get("/enquiries");
export const updateEnquiryStatus = (id, status) => api.put(`/enquiries/${id}/status?status=${status}`);
export const deleteEnquiry = (id) => api.delete(`/enquiries/${id}`);

// Collections
export const getCollections = () => api.get("/collections");
export const getFeaturedCollections = () => api.get("/collections/featured");
export const getCollection = (id) => api.get(`/collections/${id}`);
export const getCollectionFabrics = (id) => api.get(`/collections/${id}/fabrics`);
export const createCollection = (data) => api.post("/collections", data);
export const updateCollection = (id, data) => api.put(`/collections/${id}`, data);
export const deleteCollection = (id) => api.delete(`/collections/${id}`);

// Stats
export const getStats = () => api.get("/stats");

// Upload - Local storage (legacy fallback)
export const uploadImage = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  
  // Explicitly get the token and include it
  const token = localStorage.getItem("locofast_token");
  
  return api.post("/upload", formData, {
    headers: { 
      "Content-Type": "multipart/form-data",
      ...(token && { Authorization: `Bearer ${token}` })
    },
  });
};

export const uploadVideo = (file, onProgress) => {
  const formData = new FormData();
  formData.append("file", file);
  
  // Explicitly get the token and include it
  const token = localStorage.getItem("locofast_token");
  
  return api.post("/upload/video", formData, {
    headers: { 
      "Content-Type": "multipart/form-data",
      ...(token && { Authorization: `Bearer ${token}` })
    },
    timeout: 300000, // 5 min timeout for large files
    onUploadProgress: (progressEvent) => {
      if (onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });
};

// Cloudinary Upload - Cloud storage (preferred)
export const getCloudinarySignature = (resourceType = "image", folder = "fabrics") => {
  return api.get(`/cloudinary/signature?resource_type=${resourceType}&folder=${folder}`);
};

export const uploadToCloudinary = async (file, folder = "fabrics", onProgress = null) => {
  try {
    // Get signature from backend
    const sigResponse = await getCloudinarySignature("image", folder);
    const sig = sigResponse.data;
    
    // Create form data for Cloudinary
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sig.api_key);
    formData.append("timestamp", sig.timestamp);
    formData.append("signature", sig.signature);
    formData.append("folder", sig.folder);
    
    // Upload directly to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
      { method: "POST", body: formData }
    );
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    return {
      data: {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height
      }
    };
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    // Re-throw with status info if it's an axios error
    if (error.response?.status === 401) {
      const authError = new Error("Session expired. Please log in again.");
      authError.response = { status: 401 };
      throw authError;
    }
    throw error;
  }
};

export const uploadVideoToCloudinary = async (file, folder = "fabrics", onProgress = null) => {
  try {
    // Get signature from backend
    const sigResponse = await getCloudinarySignature("video", folder);
    const sig = sigResponse.data;
    
    // Create form data for Cloudinary
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sig.api_key);
    formData.append("timestamp", sig.timestamp);
    formData.append("signature", sig.signature);
    formData.append("folder", sig.folder);
    
    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete);
          }
        });
      }
      
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = JSON.parse(xhr.responseText);
          if (result.error) {
            reject(new Error(result.error.message));
          } else {
            resolve({
              data: {
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                width: result.width,
                height: result.height,
                duration: result.duration
              }
            });
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloud_name}/video/upload`);
      xhr.send(formData);
    });
  } catch (error) {
    console.error("Cloudinary video upload failed:", error);
    // Re-throw with status info if it's an axios error
    if (error.response?.status === 401) {
      const authError = new Error("Session expired. Please log in again.");
      authError.response = { status: 401 };
      throw authError;
    }
    throw error;
  }
};

// SEO
export const getFabricSEO = (id) => api.get(`/seo/fabric/${id}`);
export const generateFabricSEO = (id) => api.post(`/seo/fabric/${id}/generate`);
export const regenerateSEOBlock = (id, blockName) => api.post(`/seo/fabric/${id}/regenerate-block`, { block_name: blockName });
export const updateFabricSEO = (id, data) => api.put(`/seo/fabric/${id}`, data);
export const getSEOPreview = (id) => api.get(`/seo/fabric/${id}/preview`);
export const getRelatedFabrics = (id) => api.get(`/seo/fabric/${id}/related`);
export const getOtherSellers = (fabricId) => api.get(`/fabrics/${fabricId}/other-sellers`);
export const batchGenerateSlugs = () => api.post(`/seo/batch-generate-slugs`);

// Blog - Categories
export const getBlogCategories = () => api.get("/blog/categories");
export const getBlogCategory = (id) => api.get(`/blog/categories/${id}`);
export const getBlogCategoryBySlug = (slug) => api.get(`/blog/categories/slug/${slug}`);
export const createBlogCategory = (data) => api.post("/blog/categories", data);
export const updateBlogCategory = (id, data) => api.put(`/blog/categories/${id}`, data);
export const deleteBlogCategory = (id) => api.delete(`/blog/categories/${id}`);

// Blog - Tags
export const getBlogTags = () => api.get("/blog/tags");
export const getBlogTag = (id) => api.get(`/blog/tags/${id}`);
export const getBlogTagBySlug = (slug) => api.get(`/blog/tags/slug/${slug}`);
export const createBlogTag = (data) => api.post("/blog/tags", data);
export const updateBlogTag = (id, data) => api.put(`/blog/tags/${id}`, data);
export const deleteBlogTag = (id) => api.delete(`/blog/tags/${id}`);

// Blog - Posts
export const getBlogPosts = (params) => api.get("/blog/posts", { params });
export const getBlogPostsCount = (params) => api.get("/blog/posts/count", { params });
export const getBlogPost = (id) => api.get(`/blog/posts/${id}`);
export const getBlogPostBySlug = (slug) => api.get(`/blog/posts/slug/${slug}`);
export const createBlogPost = (data) => api.post("/blog/posts", data);
export const updateBlogPost = (id, data) => api.put(`/blog/posts/${id}`, data);
export const deleteBlogPost = (id) => api.delete(`/blog/posts/${id}`);

// Blog - Stats & Sitemap
export const getBlogStats = () => api.get("/blog/stats");
export const getBlogSitemap = () => api.get("/blog/sitemap");

// Orders
export const createOrder = (data) => api.post("/orders/create", data);
export const verifyPayment = (data) => api.post("/orders/verify-payment", data);
export const getOrder = (id) => api.get(`/orders/${id}`);
export const getOrderByRazorpayId = (razorpayOrderId) => api.get(`/orders/by-razorpay/${razorpayOrderId}`);
export const listOrders = (params) => api.get("/orders", { params });
export const updateOrderStatus = (id, status) => api.put(`/orders/${id}/status?status=${status}`);
export const cancelOrder = (id, reason) => api.put(`/orders/${id}/cancel`, { reason });
export const getOrderStats = () => api.get("/orders/stats/summary");
export const listCreditWallets = () => api.get("/orders/credit/wallets");
export const editCreditWallet = (email, data) => api.put(`/orders/credit/wallets/${email}/edit`, data);
export const bulkUploadCreditWallets = (wallets, mode = "replace") => api.post("/orders/credit/wallets/bulk-upload", { wallets, mode });
export const getCreditApplications = () => api.get("/credit/applications");
export const approveCreditApplication = (id, credit_limit) => api.put(`/credit/applications/${id}/approve`, { credit_limit });
export const rejectCreditApplication = (id, reason) => api.put(`/credit/applications/${id}/reject`, { reason });
export const downloadInvoice = (orderIdOrNumber) => {
  const API_URL = process.env.REACT_APP_BACKEND_URL;
  // Order numbers contain slashes (e.g. "LF/ORD/014") which break path
  // matching, so we URL-encode the segment. Callers should prefer the
  // UUID `order.id` whenever it's available.
  return `${API_URL}/api/orders/${encodeURIComponent(orderIdOrNumber)}/invoice`;
};

// Email
export const sendOrderConfirmation = (orderId) => api.post(`/email/order-confirmation/${orderId}`);
export const sendEnquiryNotification = (enquiry) => api.post("/email/enquiry-notification", enquiry);
export const sendTestEmail = (email) => api.post(`/email/test?recipient=${email}`);

// Coupons
export const validateCoupon = (code, subtotal) => api.post("/coupons/validate", { code, subtotal });
export const getCoupons = () => api.get("/coupons");
export const getCoupon = (id) => api.get(`/coupons/${id}`);
export const createCoupon = (data) => api.post("/coupons", data);
export const updateCoupon = (id, data) => api.put(`/coupons/${id}`, data);
export const deleteCoupon = (id) => api.delete(`/coupons/${id}`);

// Vendor Portal
export const vendorLogin = (data) => api.post("/vendor/login", data);
export const getVendorProfile = () => api.get("/vendor/me");
export const getVendorFabrics = () => api.get("/vendor/fabrics");
export const getVendorFabric = (id) => api.get(`/vendor/fabrics/${id}`);
export const createVendorFabric = (data) => api.post("/vendor/fabrics", data);
export const updateVendorFabric = (id, data) => api.put(`/vendor/fabrics/${id}`, data);
export const deleteVendorFabric = (id) => api.delete(`/vendor/fabrics/${id}`);
export const getVendorOrders = () => api.get("/vendor/orders");
export const getVendorStats = () => api.get("/vendor/stats");
export const getVendorCategories = () => api.get("/vendor/categories");
export const getVendorEnquiries = () => api.get("/vendor/enquiries");

// Vendor RFQ / Pick Pool
export const getVendorRfqs = (status = "all", limit = 50, skip = 0) =>
  api.get(`/vendor/rfqs?status=${status}&limit=${limit}&skip=${skip}`);
export const getVendorRfqDetail = (rfqId) => api.get(`/vendor/rfqs/${rfqId}`);
export const pickVendorRfq = (rfqId) => api.post(`/vendor/rfqs/${rfqId}/pick`);
export const submitVendorQuote = (rfqId, payload) =>
  api.post(`/vendor/rfqs/${rfqId}/quote`, payload);
export const updateVendorQuote = (quoteId, payload) =>
  api.put(`/vendor/rfqs/quotes/${quoteId}`, payload);
export const closeVendorRfq = (rfqId) => api.post(`/vendor/rfqs/${rfqId}/close`);
export const reopenVendorRfq = (rfqId) => api.delete(`/vendor/rfqs/${rfqId}/close`);
export const getVendorRfqStats = (period = "7d") =>
  api.get(`/vendor/rfqs/stats?period=${period}`);

// Fabric seller assignment
export const bulkAssignSeller = (sellerId) => api.post("/fabrics/bulk-assign-seller", { seller_id: sellerId });
export const reassignFabricSeller = (fabricIds, sellerId) => api.post("/fabrics/reassign-seller", { fabric_ids: fabricIds, seller_id: sellerId });

export default api;
