"""
Test suite for Availability Filters and Vendor Portal features
Tests: Instant Bookable, Samples Only, Bulk In Stock, Enquiry Only filters
Tests: Vendor login authentication
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fabric-sourcing-cms.preview.emergentagent.com')

class TestAvailabilityFilters:
    """Test availability filter options on /api/fabrics endpoint"""
    
    def test_instant_bookable_filter(self):
        """Test instant_bookable=true filter returns bookable fabrics"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"instant_bookable": "true", "limit": 10})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        fabrics = response.json()
        print(f"Instant bookable filter returned {len(fabrics)} fabrics")
        
        # All returned fabrics should be bookable with pricing
        for fabric in fabrics:
            assert fabric.get('is_bookable') == True, f"Fabric {fabric['id']} should be bookable"
            # Should have sample_price OR rate_per_meter OR quantity_available
            has_pricing = (
                fabric.get('sample_price') and fabric.get('sample_price') > 0 or
                fabric.get('rate_per_meter') and fabric.get('rate_per_meter') > 0 or
                fabric.get('quantity_available') and fabric.get('quantity_available') > 0
            )
            assert has_pricing, f"Fabric {fabric['id']} should have pricing or stock"
    
    def test_instant_bookable_count(self):
        """Test count endpoint for instant_bookable"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count", params={"instant_bookable": "true"})
        assert response.status_code == 200
        
        data = response.json()
        assert 'count' in data
        print(f"Instant bookable count: {data['count']}")
    
    def test_sample_available_filter(self):
        """Test sample_available=true filter"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"sample_available": "true", "limit": 10})
        assert response.status_code == 200
        
        fabrics = response.json()
        print(f"Samples Only filter returned {len(fabrics)} fabrics")
        
        # All returned fabrics should be bookable with sample pricing
        for fabric in fabrics:
            assert fabric.get('is_bookable') == True, f"Fabric {fabric['id']} should be bookable"
    
    def test_bulk_available_filter(self):
        """Test bookable_only=true filter for bulk in stock"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"bookable_only": "true", "limit": 10})
        assert response.status_code == 200
        
        fabrics = response.json()
        print(f"Bulk In Stock filter returned {len(fabrics)} fabrics")
        
        # All returned fabrics should be bookable with quantity
        for fabric in fabrics:
            assert fabric.get('is_bookable') == True
            assert fabric.get('quantity_available') and fabric.get('quantity_available') > 0
    
    def test_enquiry_only_filter(self):
        """Test enquiry_only=true filter returns non-bookable fabrics"""
        response = requests.get(f"{BASE_URL}/api/fabrics", params={"enquiry_only": "true", "limit": 10})
        assert response.status_code == 200
        
        fabrics = response.json()
        print(f"Enquiry Only filter returned {len(fabrics)} fabrics")
        
        # All returned fabrics should NOT be bookable or have no pricing/stock
        for fabric in fabrics:
            is_bookable = fabric.get('is_bookable', False)
            sample_price = fabric.get('sample_price') or 0
            rate_per_meter = fabric.get('rate_per_meter') or 0
            quantity = fabric.get('quantity_available') or 0
            
            # Fabric is enquiry-only if not bookable OR has no pricing/stock
            is_enquiry_only = (
                not is_bookable or 
                (sample_price == 0 and rate_per_meter == 0 and quantity == 0)
            )
            assert is_enquiry_only, f"Fabric {fabric['id']} should be enquiry-only"
    
    def test_enquiry_only_count(self):
        """Test count endpoint for enquiry_only"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count", params={"enquiry_only": "true"})
        assert response.status_code == 200
        
        data = response.json()
        assert 'count' in data
        print(f"Enquiry only count: {data['count']}")


class TestVendorAuth:
    """Test vendor portal authentication"""
    
    def test_vendor_login_invalid_credentials(self):
        """Test vendor login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert 'detail' in data
        print(f"Invalid login response: {data['detail']}")
    
    def test_vendor_login_missing_fields(self):
        """Test vendor login with missing fields"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": "test@test.com"
        })
        # Should return 422 for validation error
        assert response.status_code in [401, 422], f"Expected 401/422, got {response.status_code}"
    
    def test_vendor_me_without_auth(self):
        """Test /vendor/me without authentication returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/vendor/me")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_vendor_fabrics_without_auth(self):
        """Test /vendor/fabrics without authentication returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/vendor/fabrics")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestCheckoutGST:
    """Test GST calculation in checkout"""
    
    def test_fabric_for_checkout_exists(self):
        """Test that the test fabric exists and is bookable"""
        fabric_id = "8e6c6e09-f711-455b-9900-1044574d7c25"
        response = requests.get(f"{BASE_URL}/api/fabrics/{fabric_id}")
        assert response.status_code == 200
        
        fabric = response.json()
        assert fabric.get('is_bookable') == True, "Test fabric should be bookable"
        assert fabric.get('sample_price', 0) > 0, "Test fabric should have sample price"
        print(f"Test fabric: {fabric['name']}, Sample price: {fabric.get('sample_price')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
