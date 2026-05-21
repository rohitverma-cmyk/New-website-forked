# Shiprocket API Integration - Developer Guide

## Overview

This module provides a complete REST API integration with Shiprocket shipping platform. It's designed to be easily integrated with your main ERP application.

## Quick Start

### Base URL
```
/api/shiprocket
```

### Authentication
The integration handles Shiprocket authentication automatically using credentials from environment variables:
- `SHIPROCKET_API_EMAIL`: Your Shiprocket account email
- `SHIPROCKET_API_PASSWORD`: Your Shiprocket account password

Tokens are auto-refreshed 24 hours before expiry.

---

## API Endpoints

### 1. Orders Management

#### Create Order
```http
POST /api/shiprocket/orders/create
Content-Type: application/json

{
    "order_id": "ERP-ORDER-001",
    "order_date": "2026-01-15T10:30:00",
    "pickup_location": "Primary Warehouse",
    
    "billing_customer_name": "John",
    "billing_last_name": "Doe",
    "billing_email": "john@example.com",
    "billing_phone": "9876543210",
    "billing_address": "123 Main Street",
    "billing_city": "Mumbai",
    "billing_state": "Maharashtra",
    "billing_pincode": "400001",
    
    "shipping_is_billing": false,
    "shipping_customer_name": "John",
    "shipping_last_name": "Doe",
    "shipping_email": "john@example.com",
    "shipping_phone": "9876543210",
    "shipping_address": "456 Delivery Street",
    "shipping_city": "Delhi",
    "shipping_state": "Delhi",
    "shipping_pincode": "110001",
    
    "order_items": [
        {
            "name": "Cotton T-Shirt",
            "sku": "TSH-001",
            "units": 2,
            "selling_price": 599.00,
            "discount": 0,
            "tax": 0,
            "hsn_code": "6109"
        }
    ],
    
    "weight": 0.5,
    "length": 20,
    "breadth": 15,
    "height": 5,
    
    "payment_method": "Prepaid",
    "sub_total": 1198.00
}
```

**Response:**
```json
{
    "success": true,
    "message": "Order created successfully",
    "order_id": 12345678,
    "shipment_id": 87654321,
    "status": "NEW"
}
```

#### Get Order
```http
GET /api/shiprocket/orders/{order_id}
```

#### Get All Orders
```http
GET /api/shiprocket/orders/?page=1&per_page=20&sort=desc
```

#### Cancel Order
```http
POST /api/shiprocket/orders/cancel
Content-Type: application/json

[12345678, 12345679]
```

---

### 2. Courier & Rates

#### Calculate Shipping Rates
```http
POST /api/shiprocket/courier/rates
Content-Type: application/json

{
    "pickup_postcode": "400001",
    "delivery_postcode": "110001",
    "weight": 0.5,
    "length": 20,
    "breadth": 15,
    "height": 5,
    "cod": false
}
```

**Response:**
```json
{
    "success": true,
    "message": "Found 5 available courier(s)",
    "available_couriers": [
        {
            "courier_id": 1,
            "courier_name": "Delhivery",
            "rate": 65.00,
            "estimated_delivery_days": 3,
            "chargeable_weight": 0.5,
            "mode": "Surface"
        }
    ],
    "recommended_courier": {...}
}
```

#### Assign AWB (Courier & Tracking Number)
```http
POST /api/shiprocket/courier/assign-awb
Content-Type: application/json

{
    "shipment_id": 87654321,
    "courier_id": 1  // Optional - auto-assigned if not provided
}
```

#### Check Serviceability
```http
GET /api/shiprocket/courier/serviceability?pickup_pincode=400001&delivery_pincode=110001
```

---

### 3. Tracking

#### Track by AWB
```http
GET /api/shiprocket/tracking/awb/{awb_code}
```

#### Track by Shipment ID
```http
GET /api/shiprocket/tracking/shipment/{shipment_id}
```

#### Track by Order ID
```http
GET /api/shiprocket/tracking/order/{order_id}
```

#### Bulk Tracking
```http
POST /api/shiprocket/tracking/bulk
Content-Type: application/json

{
    "awb_codes": ["12345678901", "12345678902"]
}
```

---

### 4. Pickup & Documents

#### Get Pickup Locations
```http
GET /api/shiprocket/pickup/locations
```

#### Add Pickup Location
```http
POST /api/shiprocket/pickup/locations
Content-Type: application/json

{
    "pickup_location": "Warehouse B",
    "name": "John Manager",
    "email": "warehouse@company.com",
    "phone": "9876543210",
    "address": "Industrial Area, Sector 5",
    "city": "Gurgaon",
    "state": "Haryana",
    "country": "India",
    "pin_code": "122001"
}
```

#### Schedule Pickup
```http
POST /api/shiprocket/pickup/schedule
Content-Type: application/json

{
    "shipment_ids": [87654321, 87654322]
}
```

#### Generate Labels
```http
POST /api/shiprocket/pickup/labels
Content-Type: application/json

{
    "shipment_ids": [87654321]
}
```

**Response:**
```json
{
    "success": true,
    "message": "Labels generated for 1 shipment(s)",
    "label_url": "https://shiprocket.co/labels/xyz.pdf"
}
```

#### Generate Invoice
```http
POST /api/shiprocket/pickup/invoices
Content-Type: application/json

{
    "order_ids": [12345678]
}
```

#### Generate Manifest
```http
POST /api/shiprocket/pickup/manifests
Content-Type: application/json

{
    "shipment_ids": [87654321]
}
```

---

### 5. Returns & RTO

#### Create Return Order
```http
POST /api/shiprocket/returns/create
Content-Type: application/json

{
    "order_id": "RET-ERP-ORDER-001",
    "order_date": "2026-01-15T10:30:00",
    
    "pickup_customer_name": "John",
    "pickup_last_name": "Doe",
    "pickup_email": "john@example.com",
    "pickup_phone": "9876543210",
    "pickup_address": "456 Delivery Street",
    "pickup_city": "Delhi",
    "pickup_state": "Delhi",
    "pickup_pincode": "110001",
    
    "shipping_customer_name": "Warehouse",
    "shipping_last_name": "Manager",
    "shipping_email": "warehouse@company.com",
    "shipping_phone": "9876543210",
    "shipping_address": "123 Main Street",
    "shipping_city": "Mumbai",
    "shipping_state": "Maharashtra",
    "shipping_pincode": "400001",
    
    "order_items": [
        {
            "name": "Cotton T-Shirt",
            "sku": "TSH-001",
            "units": 1,
            "selling_price": 599.00,
            "qc_enable": true
        }
    ],
    
    "weight": 0.5,
    "payment_method": "Prepaid",
    "sub_total": 599.00
}
```

#### Get NDR Shipments
```http
GET /api/shiprocket/returns/ndr?page=1&per_page=20
```

#### Take NDR Action
```http
POST /api/shiprocket/returns/ndr/action
Content-Type: application/json

{
    "awb": "12345678901",
    "action": "re-attempt",
    "comments": "Customer available after 6 PM",
    "preferred_date": "2026-01-20",
    "phone": "9876543211"
}
```

---

### 6. Webhooks

Configure these webhook URLs in your Shiprocket dashboard to receive real-time updates:

#### Tracking Updates
```
POST /api/shiprocket/webhooks/tracking
```

#### Order Status Updates
```
POST /api/shiprocket/webhooks/order-status
```

#### Get Recent Events (for debugging)
```http
GET /api/shiprocket/webhooks/events?limit=50
```

---

## Integration Workflow

### Standard Order Workflow

```
1. Create Order          → POST /orders/create
                            ↓
2. Assign AWB            → POST /courier/assign-awb
                            ↓
3. Generate Label        → POST /pickup/labels
                            ↓
4. Schedule Pickup       → POST /pickup/schedule
                            ↓
5. Track Shipment        → GET /tracking/awb/{awb}
```

### Return Workflow

```
1. Create Return Order   → POST /returns/create
                            ↓
2. Assign AWB            → POST /courier/assign-awb
                            ↓
3. Schedule Pickup       → POST /pickup/schedule
                            ↓
4. Track Return          → GET /tracking/awb/{awb}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
    "success": false,
    "message": "Error description",
    "errors": ["Detailed error 1", "Detailed error 2"]
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication issue)
- `404` - Not Found
- `500` - Internal Server Error

---

## Best Practices

1. **Rate Limiting**: The API has built-in retry logic with exponential backoff
2. **Idempotency**: Use unique `order_id` to prevent duplicate orders
3. **Validation**: All inputs are validated using Pydantic schemas
4. **Logging**: All operations are logged for debugging
5. **Webhooks**: Implement webhook handlers to get real-time updates

---

## Health Check

```http
GET /api/shiprocket/health
```

**Response:**
```json
{
    "status": "healthy",
    "shiprocket_connected": true,
    "token_valid": true,
    "message": "Shiprocket integration is operational"
}
```

---

## Interactive API Documentation

Once the server is running, access the interactive API docs at:
- **Swagger UI**: `/docs`
- **ReDoc**: `/redoc`

---

## Support

For Shiprocket API issues, refer to:
- [Shiprocket API Documentation](https://apidocs.shiprocket.in)
- [Shiprocket Support](https://support.shiprocket.in)
