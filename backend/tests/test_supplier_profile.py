"""
Test Supplier Profile API endpoints
- GET /api/suppliers/{slug}/profile - Full supplier profile by slug
- GET /api/suppliers/directory - List all active suppliers
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSupplierProfileAPI:
    """Tests for supplier profile endpoints"""

    def test_get_pali_mills_profile(self):
        """Test GET /api/suppliers/pali-mills/profile returns seller with company_name 'Pali Mills'"""
        response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify seller data structure
        assert "seller" in data, "Response should contain 'seller' key"
        assert data["seller"]["company_name"] == "Pali Mills", f"Expected 'Pali Mills', got {data['seller']['company_name']}"
        assert data["seller"]["slug"] == "pali-mills", "Slug should be 'pali-mills'"
        
        # Verify stats structure
        assert "stats" in data, "Response should contain 'stats' key"
        assert "total_skus" in data["stats"], "Stats should contain 'total_skus'"
        assert "total_orders" in data["stats"], "Stats should contain 'total_orders'"
        assert "on_time_rate" in data["stats"], "Stats should contain 'on_time_rate'"
        assert "years_in_business" in data["stats"], "Stats should contain 'years_in_business'"
        
        # Verify other required keys
        assert "fabrics" in data, "Response should contain 'fabrics' key"
        assert "review_stats" in data, "Response should contain 'review_stats' key"
        assert "similar_suppliers" in data, "Response should contain 'similar_suppliers' key"

    def test_get_test_fabrics_co_profile(self):
        """Test GET /api/suppliers/test-fabrics-co/profile returns seller with fabrics array"""
        response = requests.get(f"{BASE_URL}/api/suppliers/test-fabrics-co/profile")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify seller data
        assert data["seller"]["company_name"] == "Test Fabrics Co.", f"Expected 'Test Fabrics Co.', got {data['seller']['company_name']}"
        assert data["seller"]["gst_verified"] == True, "Test Fabrics Co. should have GST verified"
        
        # Verify fabrics array exists and has items
        assert "fabrics" in data, "Response should contain 'fabrics' key"
        assert isinstance(data["fabrics"], list), "Fabrics should be a list"
        assert len(data["fabrics"]) >= 1, f"Expected at least 1 fabric, got {len(data['fabrics'])}"
        
        # Verify stats reflect fabrics
        assert data["stats"]["total_skus"] >= 1, "Total SKUs should be at least 1"
        assert data["stats"]["in_stock"] >= 1, "In stock should be at least 1"

    def test_get_supplier_directory(self):
        """Test GET /api/suppliers/directory returns array of active suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers/directory")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Directory should return a list"
        assert len(data) >= 1, "Directory should have at least 1 supplier"
        
        # Verify supplier structure
        supplier = data[0]
        assert "id" in supplier, "Supplier should have 'id'"
        assert "company_name" in supplier, "Supplier should have 'company_name'"
        assert "slug" in supplier, "Supplier should have 'slug'"
        assert "city" in supplier, "Supplier should have 'city'"
        assert "state" in supplier, "Supplier should have 'state'"
        assert "primary_category" in supplier, "Supplier should have 'primary_category'"
        assert "fabric_count" in supplier, "Supplier should have 'fabric_count'"

    def test_get_nonexistent_supplier_returns_404(self):
        """Test GET /api/suppliers/nonexistent/profile returns 404"""
        response = requests.get(f"{BASE_URL}/api/suppliers/nonexistent/profile")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "404 response should have 'detail' key"
        assert "not found" in data["detail"].lower(), "Detail should mention 'not found'"

    def test_supplier_profile_has_review_stats(self):
        """Test supplier profile includes review_stats with sub_ratings"""
        response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
        assert response.status_code == 200
        
        data = response.json()
        review_stats = data["review_stats"]
        
        assert "average" in review_stats, "review_stats should have 'average'"
        assert "count" in review_stats, "review_stats should have 'count'"
        assert "distribution" in review_stats, "review_stats should have 'distribution'"
        assert "sub_ratings" in review_stats, "review_stats should have 'sub_ratings'"
        
        # Verify sub_ratings structure
        sub_ratings = review_stats["sub_ratings"]
        assert "quality" in sub_ratings, "sub_ratings should have 'quality'"
        assert "communication" in sub_ratings, "sub_ratings should have 'communication'"
        assert "on_time_delivery" in sub_ratings, "sub_ratings should have 'on_time_delivery'"
        assert "packaging" in sub_ratings, "sub_ratings should have 'packaging'"

    def test_supplier_profile_has_similar_suppliers(self):
        """Test supplier profile includes similar_suppliers array"""
        response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
        assert response.status_code == 200
        
        data = response.json()
        similar = data["similar_suppliers"]
        
        assert isinstance(similar, list), "similar_suppliers should be a list"
        # Should have at least some similar suppliers
        if len(similar) > 0:
            sim = similar[0]
            assert "id" in sim, "Similar supplier should have 'id'"
            assert "company_name" in sim, "Similar supplier should have 'company_name'"
            assert "slug" in sim, "Similar supplier should have 'slug'"
            assert "city" in sim, "Similar supplier should have 'city'"

    def test_supplier_profile_seller_fields(self):
        """Test supplier profile seller object has all required fields"""
        response = requests.get(f"{BASE_URL}/api/suppliers/test-fabrics-co/profile")
        assert response.status_code == 200
        
        seller = response.json()["seller"]
        
        # Required fields
        required_fields = [
            "id", "company_name", "slug", "city", "state", "contact_name",
            "contact_email", "contact_phone", "gst_verified", "business_type",
            "languages", "working_hours", "payment_terms", "payment_modes",
            "moq", "dispatch_city", "packing_method", "standard_lead_time",
            "custom_lead_time", "sample_lead_time"
        ]
        
        for field in required_fields:
            assert field in seller, f"Seller should have '{field}' field"

    def test_supplier_profile_stats_fields(self):
        """Test supplier profile stats object has all required fields"""
        response = requests.get(f"{BASE_URL}/api/suppliers/test-fabrics-co/profile")
        assert response.status_code == 200
        
        stats = response.json()["stats"]
        
        required_fields = [
            "total_skus", "in_stock", "low_stock", "bookable", "total_orders",
            "on_time_rate", "response_time", "years_in_business",
            "category_counts", "stock_by_category"
        ]
        
        for field in required_fields:
            assert field in stats, f"Stats should have '{field}' field"


class TestSupplierEnquiryAPI:
    """Tests for supplier enquiry endpoint"""

    def test_create_enquiry_success(self):
        """Test POST /api/suppliers/{slug}/enquiry saves enquiry successfully"""
        payload = {
            "name": "Test User",
            "company_name": "Test Company",
            "country": "India",
            "product_interest": "Cotton",
            "quantity": "500 meters",
            "message": "Testing enquiry form"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers/pali-mills/enquiry", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == True, "Response should have success=True"
        assert "message" in data, "Response should have 'message' key"

    def test_create_enquiry_minimal_fields(self):
        """Test POST /api/suppliers/{slug}/enquiry with minimal fields"""
        payload = {
            "name": "Minimal User",
            "company_name": "Minimal Co"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers/test-fabrics-co/enquiry", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == True, "Response should have success=True"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
