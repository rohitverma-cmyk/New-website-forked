/**
 * GA4 Enhanced Ecommerce Analytics
 * 
 * Tracks the full user funnel:
 *   view_item_list → view_item → add_to_cart → begin_checkout → purchase
 *   + generate_lead (RFQ / Supplier Signup)
 * 
 * Usage: import { trackViewItem, trackAddToCart, ... } from '../lib/analytics';
 */

const gtag = (...args) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args);
  }
};

/**
 * User views a list of fabrics (catalog, collection, search results)
 */
export const trackViewItemList = (fabrics, listName = 'Fabric Catalog') => {
  gtag('event', 'view_item_list', {
    item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
    item_list_name: listName,
    items: fabrics.slice(0, 10).map((f, i) => ({
      item_id: f.id,
      item_name: f.name,
      item_category: f.category_name || '',
      item_brand: f.seller_name || '',
      price: f.rate_per_meter || 0,
      index: i,
    })),
  });
};

/**
 * User views a single fabric detail page
 */
export const trackViewItem = (fabric) => {
  gtag('event', 'view_item', {
    currency: 'INR',
    value: fabric.rate_per_meter || 0,
    items: [{
      item_id: fabric.id,
      item_name: fabric.name,
      item_category: fabric.category_name || '',
      item_brand: fabric.seller_name || '',
      item_variant: fabric.fabric_type || '',
      price: fabric.rate_per_meter || 0,
      quantity: 1,
    }],
  });
};

/**
 * User clicks "Book Bulk" or "Book Sample"
 */
export const trackAddToCart = (fabric, orderType, quantity, price) => {
  gtag('event', 'add_to_cart', {
    currency: 'INR',
    value: price * quantity,
    items: [{
      item_id: fabric.id,
      item_name: fabric.name,
      item_category: fabric.category_name || '',
      item_brand: fabric.seller_name || '',
      item_variant: orderType,
      price: price,
      quantity: quantity,
    }],
  });
};

/**
 * User reaches the checkout page
 */
export const trackBeginCheckout = (fabric, orderType, quantity, total) => {
  gtag('event', 'begin_checkout', {
    currency: 'INR',
    value: total,
    items: [{
      item_id: fabric.id,
      item_name: fabric.name,
      item_category: fabric.category_name || '',
      item_brand: fabric.seller_name || '',
      item_variant: orderType,
      price: fabric.rate_per_meter || 0,
      quantity: quantity,
    }],
  });
};

/**
 * Order confirmed / payment successful
 */
export const trackPurchase = (order) => {
  gtag('event', 'purchase', {
    transaction_id: order.order_number,
    currency: 'INR',
    value: order.total_amount || 0,
    tax: order.tax_amount || 0,
    shipping: 0,
    items: [{
      item_id: order.fabric_id || '',
      item_name: order.fabric_name || '',
      item_variant: order.order_type || '',
      price: order.price_per_unit || 0,
      quantity: order.quantity || 1,
    }],
  });
};

/**
 * User submits RFQ / Request a Quote
 */
export const trackGenerateLead = (leadData) => {
  gtag('event', 'generate_lead', {
    currency: 'INR',
    value: 0,
    lead_source: leadData.source || 'website',
    fabric_type: leadData.fabric_type || '',
    fabric_name: leadData.fabric_name || '',
    location: leadData.location || '',
  });
};

/**
 * User submits supplier signup form
 */
export const trackSupplierSignup = (data) => {
  gtag('event', 'generate_lead', {
    currency: 'INR',
    value: 0,
    lead_source: 'supplier_signup',
    company: data.company || '',
    categories: data.categories || '',
  });
};

/**
 * User clicks "Request a Quote" button (before form opens)
 */
export const trackRFQIntent = (fabricName, source) => {
  gtag('event', 'rfq_intent', {
    fabric_name: fabricName || '',
    source: source || 'unknown',
  });
};
