"""
Test Reviews CMS and Additional Fields Features
- POST /api/reviews (create review with auth)
- GET /api/reviews (list reviews with auth)
- GET /api/reviews?seller_id=xxx (filter by seller)
- DELETE /api/reviews/{id} (delete review with auth)
- PUT /api/sellers/{id} (update seller with additional fields)
- GET /api/suppliers/{slug}/profile (verify review_stats computed from reviews)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReviewsCMS:
    """Reviews CMS endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, admin_token):
        """Headers with admin auth token"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def seller_id(self, auth_headers):
        """Get a valid seller ID for testing"""
        response = requests.get(f"{BASE_URL}/api/sellers", headers=auth_headers)
        assert response.status_code == 200
        sellers = response.json()
        assert len(sellers) > 0, "No sellers found in database"
        return sellers[0]["id"]
    
    # ==================== POST /api/reviews ====================
    
    def test_create_review_requires_auth(self):
        """POST /api/reviews without auth should return 401 or 403"""
        response = requests.post(f"{BASE_URL}/api/reviews", json={
            "seller_id": "test",
            "customer_name": "Test Customer",
            "rating": 5
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_create_review_validates_required_fields(self, auth_headers):
        """POST /api/reviews validates required fields (seller_id, customer_name, rating)"""
        # Missing seller_id
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "customer_name": "Test Customer",
            "rating": 5
        })
        assert response.status_code == 400, f"Expected 400 for missing seller_id, got {response.status_code}"
        
        # Missing customer_name
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": "test",
            "rating": 5
        })
        assert response.status_code == 400, f"Expected 400 for missing customer_name, got {response.status_code}"
        
        # Missing rating
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": "test",
            "customer_name": "Test Customer"
        })
        assert response.status_code == 400, f"Expected 400 for missing rating, got {response.status_code}"
    
    def test_create_review_validates_rating_range(self, auth_headers, seller_id):
        """POST /api/reviews validates rating is between 1 and 5"""
        # Rating too low
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": seller_id,
            "customer_name": "Test Customer",
            "rating": 0
        })
        assert response.status_code == 400, f"Expected 400 for rating=0, got {response.status_code}"
        
        # Rating too high
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": seller_id,
            "customer_name": "Test Customer",
            "rating": 6
        })
        assert response.status_code == 400, f"Expected 400 for rating=6, got {response.status_code}"
    
    def test_create_review_validates_seller_exists(self, auth_headers):
        """POST /api/reviews returns 404 for non-existent seller"""
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": "nonexistent-seller-id",
            "customer_name": "Test Customer",
            "rating": 5
        })
        assert response.status_code == 404, f"Expected 404 for non-existent seller, got {response.status_code}"
    
    def test_create_review_success(self, auth_headers, seller_id):
        """POST /api/reviews creates a review successfully"""
        test_data = {
            "seller_id": seller_id,
            "customer_name": "TEST_ReviewCustomer",
            "customer_company": "TEST_Company Ltd",
            "customer_location": "Mumbai, India",
            "rating": 4,
            "review_text": "Great quality fabrics and timely delivery!",
            "review_date": "2025-01-15",
            "is_verified": True
        }
        
        response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        review = response.json()
        assert "id" in review, "Response should contain review id"
        assert review["seller_id"] == seller_id
        assert review["customer_name"] == "TEST_ReviewCustomer"
        assert review["customer_company"] == "TEST_Company Ltd"
        assert review["customer_location"] == "Mumbai, India"
        assert review["rating"] == 4
        assert review["review_text"] == "Great quality fabrics and timely delivery!"
        assert review["review_date"] == "2025-01-15"
        assert review["is_verified"] == True
        assert "seller_name" in review, "Response should contain seller_name"
        
        # Store review_id for cleanup
        TestReviewsCMS.created_review_id = review["id"]
        return review["id"]
    
    # ==================== GET /api/reviews ====================
    
    def test_get_reviews_requires_auth(self):
        """GET /api/reviews without auth should return 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/reviews")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_get_reviews_returns_all(self, auth_headers):
        """GET /api/reviews returns all reviews"""
        response = requests.get(f"{BASE_URL}/api/reviews", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        reviews = response.json()
        assert isinstance(reviews, list), "Response should be a list"
        # Should have at least the test review we created
        assert len(reviews) >= 1, "Should have at least 1 review"
        
        # Verify review structure
        if len(reviews) > 0:
            review = reviews[0]
            assert "id" in review
            assert "seller_id" in review
            assert "customer_name" in review
            assert "rating" in review
    
    def test_get_reviews_filter_by_seller(self, auth_headers, seller_id):
        """GET /api/reviews?seller_id=xxx filters by seller"""
        response = requests.get(f"{BASE_URL}/api/reviews", headers=auth_headers, params={"seller_id": seller_id})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        reviews = response.json()
        assert isinstance(reviews, list), "Response should be a list"
        
        # All reviews should be for the specified seller
        for review in reviews:
            assert review["seller_id"] == seller_id, f"Review seller_id mismatch: {review['seller_id']} != {seller_id}"
    
    # ==================== DELETE /api/reviews/{id} ====================
    
    def test_delete_review_requires_auth(self):
        """DELETE /api/reviews/{id} without auth should return 401 or 403"""
        response = requests.delete(f"{BASE_URL}/api/reviews/test-id")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_delete_review_not_found(self, auth_headers):
        """DELETE /api/reviews/{id} returns 404 for non-existent review"""
        response = requests.delete(f"{BASE_URL}/api/reviews/nonexistent-review-id", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_delete_review_success(self, auth_headers, seller_id):
        """DELETE /api/reviews/{id} deletes a review successfully"""
        # First create a review to delete
        create_response = requests.post(f"{BASE_URL}/api/reviews", headers=auth_headers, json={
            "seller_id": seller_id,
            "customer_name": "TEST_ToDelete",
            "rating": 3,
            "review_text": "This review will be deleted"
        })
        assert create_response.status_code == 200
        review_id = create_response.json()["id"]
        
        # Delete the review
        delete_response = requests.delete(f"{BASE_URL}/api/reviews/{review_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify it's deleted - should not appear in list
        list_response = requests.get(f"{BASE_URL}/api/reviews", headers=auth_headers)
        reviews = list_response.json()
        review_ids = [r["id"] for r in reviews]
        assert review_id not in review_ids, "Deleted review should not appear in list"


class TestSupplierProfileReviews:
    """Test that supplier profile returns real review stats computed from reviews collection"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, admin_token):
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    def test_supplier_profile_has_review_stats(self):
        """GET /api/suppliers/{slug}/profile returns review_stats"""
        response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        profile = response.json()
        assert "review_stats" in profile, "Profile should contain review_stats"
        
        stats = profile["review_stats"]
        assert "average" in stats, "review_stats should have average"
        assert "count" in stats, "review_stats should have count"
        assert "distribution" in stats, "review_stats should have distribution"
        assert "sub_ratings" in stats, "review_stats should have sub_ratings"
        
        # Verify distribution structure
        dist = stats["distribution"]
        for key in ["1", "2", "3", "4", "5"]:
            assert key in dist, f"distribution should have key {key}"
        
        # Verify sub_ratings structure
        sub = stats["sub_ratings"]
        for key in ["quality", "communication", "on_time_delivery", "packaging"]:
            assert key in sub, f"sub_ratings should have key {key}"
    
    def test_supplier_profile_has_reviews_array(self):
        """GET /api/suppliers/{slug}/profile returns reviews array"""
        response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
        assert response.status_code == 200
        
        profile = response.json()
        assert "reviews" in profile, "Profile should contain reviews array"
        assert isinstance(profile["reviews"], list), "reviews should be a list"
        
        # If there are reviews, verify structure
        if len(profile["reviews"]) > 0:
            review = profile["reviews"][0]
            assert "buyer_name" in review, "Review should have buyer_name"
            assert "rating" in review, "Review should have rating"
            assert "text" in review, "Review should have text"
            assert "date" in review, "Review should have date"
    
    def test_review_stats_computed_from_real_data(self, auth_headers):
        """Verify review_stats are computed from actual reviews in database"""
        # Get reviews for pali-mills seller
        sellers_response = requests.get(f"{BASE_URL}/api/sellers", headers=auth_headers)
        sellers = sellers_response.json()
        pali_mills = next((s for s in sellers if "pali" in s.get("company_name", "").lower()), None)
        
        if pali_mills:
            seller_id = pali_mills["id"]
            
            # Get reviews for this seller
            reviews_response = requests.get(f"{BASE_URL}/api/reviews", headers=auth_headers, params={"seller_id": seller_id})
            reviews = reviews_response.json()
            
            # Get supplier profile
            profile_response = requests.get(f"{BASE_URL}/api/suppliers/pali-mills/profile")
            profile = profile_response.json()
            
            # Verify count matches
            assert profile["review_stats"]["count"] == len(reviews), \
                f"review_stats.count ({profile['review_stats']['count']}) should match actual reviews count ({len(reviews)})"
            
            # Verify average is computed correctly
            if len(reviews) > 0:
                expected_avg = round(sum(r["rating"] for r in reviews) / len(reviews), 1)
                assert profile["review_stats"]["average"] == expected_avg, \
                    f"review_stats.average ({profile['review_stats']['average']}) should match computed average ({expected_avg})"


class TestSellerAdditionalFields:
    """Test Additional Fields in Seller CRUD"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, admin_token):
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def test_seller_id(self, auth_headers):
        """Get a seller ID for testing updates"""
        response = requests.get(f"{BASE_URL}/api/sellers", headers=auth_headers)
        sellers = response.json()
        return sellers[0]["id"] if sellers else None
    
    def test_update_seller_with_additional_fields(self, auth_headers, test_seller_id):
        """PUT /api/sellers/{id} accepts and persists additional fields"""
        update_data = {
            "established_year": 2005,
            "monthly_capacity": "1,20,000m/month",
            "employee_count": "150-200",
            "factory_size": "25,000 sq ft",
            "turnover_range": "10-50 Crore",
            "certifications": ["GOTS", "OEKO-TEX", "ISO 9001"],
            "export_markets": ["Bangladesh", "UAE", "EU"],
            "gst_number": "24AABCS1429B1Z5"
        }
        
        response = requests.put(f"{BASE_URL}/api/sellers/{test_seller_id}", headers=auth_headers, json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify the update by fetching the seller
        get_response = requests.get(f"{BASE_URL}/api/sellers/{test_seller_id}", headers=auth_headers)
        assert get_response.status_code == 200
        
        seller = get_response.json()
        assert seller["established_year"] == 2005, f"established_year mismatch: {seller.get('established_year')}"
        assert seller["monthly_capacity"] == "1,20,000m/month"
        assert seller["employee_count"] == "150-200"
        assert seller["factory_size"] == "25,000 sq ft"
        assert seller["turnover_range"] == "10-50 Crore"
        assert seller["certifications"] == ["GOTS", "OEKO-TEX", "ISO 9001"]
        assert seller["export_markets"] == ["Bangladesh", "UAE", "EU"]
        assert seller["gst_number"] == "24AABCS1429B1Z5"
    
    def test_seller_model_includes_additional_fields(self, auth_headers):
        """GET /api/sellers returns sellers with additional fields"""
        response = requests.get(f"{BASE_URL}/api/sellers", headers=auth_headers)
        assert response.status_code == 200
        
        sellers = response.json()
        if len(sellers) > 0:
            seller = sellers[0]
            # Verify additional fields exist in response (may be empty/null)
            additional_fields = [
                "established_year", "monthly_capacity", "employee_count",
                "factory_size", "turnover_range", "certifications",
                "export_markets", "gst_number"
            ]
            for field in additional_fields:
                assert field in seller, f"Seller should have field: {field}"


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        return response.json().get("token") if response.status_code == 200 else None
    
    def test_cleanup_test_reviews(self, admin_token):
        """Delete TEST_ prefixed reviews"""
        if not admin_token:
            pytest.skip("No admin token")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reviews", headers=headers)
        
        if response.status_code == 200:
            reviews = response.json()
            for review in reviews:
                if review.get("customer_name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/reviews/{review['id']}", headers=headers)
        
        print("Cleanup completed")
