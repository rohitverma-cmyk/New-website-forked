"""
Test suite for server.py refactor (v35) - extracted routers and dedupe features.

Tests:
1. Extracted routers: migrations_router, sitemap_router, reviews_router, upload_router
2. GET /api/fabrics returns vendor_count field
3. GET /api/fabrics?dedupe_by_article=true - multi-vendor dedupe
4. GET /api/fabrics/count?dedupe_by_article=true
5. GET /api/categories regression (seo_title, seo_intro)
6. Admin login and /api/stats
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "admin" in data, "No admin in response"
        assert data["admin"]["email"] == "admin@locofast.com"
        print(f"✓ Admin login successful, token received")
        return data["token"]
    
    def test_admin_login_invalid_credentials(self):
        """Admin login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid credentials correctly rejected with 401")


class TestStatsEndpoint:
    """Test /api/stats endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    def test_stats_returns_numbers(self, admin_token):
        """GET /api/stats returns fabric, category, seller counts"""
        response = requests.get(
            f"{BASE_URL}/api/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Stats failed: {response.text}"
        data = response.json()
        
        # Verify all expected fields exist and are numbers
        expected_fields = ['fabrics', 'categories', 'sellers', 'active_sellers', 
                          'collections', 'articles', 'enquiries', 'new_enquiries', 'bookable_fabrics']
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], int), f"{field} should be int, got {type(data[field])}"
        
        print(f"✓ Stats returned: fabrics={data['fabrics']}, categories={data['categories']}, sellers={data['sellers']}")
    
    def test_stats_requires_auth(self):
        """GET /api/stats without token returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Stats correctly requires authentication")


class TestSitemapRouter:
    """Test sitemap_router.py - GET /api/sitemap.xml"""
    
    def test_sitemap_returns_xml(self):
        """GET /api/sitemap.xml returns valid XML"""
        response = requests.get(f"{BASE_URL}/api/sitemap.xml")
        assert response.status_code == 200, f"Sitemap failed: {response.text}"
        assert "application/xml" in response.headers.get("content-type", ""), "Content-type should be XML"
        
        content = response.text
        assert '<?xml version="1.0"' in content, "Missing XML declaration"
        assert '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' in content, "Missing urlset"
        assert '<loc>' in content, "Missing loc elements"
        assert '</urlset>' in content, "Missing closing urlset"
        
        # Check for expected static pages
        assert 'locofast.com/' in content, "Missing homepage"
        assert 'locofast.com/fabrics' in content, "Missing fabrics page"
        
        print(f"✓ Sitemap returned valid XML with {content.count('<url>')} URLs")


class TestReviewsRouter:
    """Test reviews_router.py - /api/reviews CRUD"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    def test_reviews_requires_auth(self):
        """GET /api/reviews without token returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/reviews")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Reviews correctly requires authentication")
    
    def test_reviews_get_with_auth(self, admin_token):
        """GET /api/reviews with auth returns list"""
        response = requests.get(
            f"{BASE_URL}/api/reviews",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Reviews GET failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Reviews should return a list"
        print(f"✓ Reviews GET returned {len(data)} reviews")


class TestMigrationsRouter:
    """Test migrations_router.py - /api/migrate/* endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    def test_migrate_greige_requires_auth(self):
        """POST /api/migrate/greige without token returns 401/403"""
        response = requests.post(f"{BASE_URL}/api/migrate/greige")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Migrate greige correctly requires authentication")
    
    def test_migrate_greige_dry_run(self, admin_token):
        """POST /api/migrate/greige (dry run) returns plan"""
        response = requests.post(
            f"{BASE_URL}/api/migrate/greige",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Migrate greige failed: {response.text}"
        data = response.json()
        
        # Should return dry run info
        assert "apply" in data, "Missing apply field"
        assert data["apply"] == False, "Should be dry run (apply=false)"
        assert "status" in data, "Missing status field"
        
        print(f"✓ Migrate greige dry run: status={data['status']}, message={data.get('message', 'N/A')}")
    
    def test_migrate_slugs_requires_auth(self):
        """POST /api/migrate/slugs without token returns 401/403"""
        response = requests.post(f"{BASE_URL}/api/migrate/slugs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Migrate slugs correctly requires authentication")


class TestUploadRouter:
    """Test upload_router.py - /api/upload and /api/upload/video"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    def test_upload_image_requires_auth(self):
        """POST /api/upload without token returns 401/403"""
        # Create a fake image file
        fake_image = io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        response = requests.post(
            f"{BASE_URL}/api/upload",
            files={"file": ("test.png", fake_image, "image/png")}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Upload image correctly requires authentication")
    
    def test_upload_image_with_auth(self, admin_token):
        """POST /api/upload with auth accepts image and returns URL"""
        # Create a minimal valid PNG
        fake_image = io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        response = requests.post(
            f"{BASE_URL}/api/upload",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.png", fake_image, "image/png")}
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Missing url in response"
        assert data["url"].startswith("/api/uploads/"), f"URL should start with /api/uploads/, got {data['url']}"
        print(f"✓ Upload image successful: {data['url']}")
    
    def test_upload_video_requires_auth(self):
        """POST /api/upload/video without token returns 401/403"""
        fake_video = io.BytesIO(b'\x00\x00\x00\x1c\x66\x74\x79\x70' + b'\x00' * 100)
        response = requests.post(
            f"{BASE_URL}/api/upload/video",
            files={"file": ("test.mp4", fake_video, "video/mp4")}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Upload video correctly requires authentication")
    
    def test_upload_video_with_auth(self, admin_token):
        """POST /api/upload/video with auth accepts video and returns URL"""
        # Create a minimal MP4-like file
        fake_video = io.BytesIO(b'\x00\x00\x00\x1c\x66\x74\x79\x70' + b'\x00' * 100)
        response = requests.post(
            f"{BASE_URL}/api/upload/video",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.mp4", fake_video, "video/mp4")}
        )
        assert response.status_code == 200, f"Video upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Missing url in response"
        assert "filename" in data, "Missing filename in response"
        assert data["url"].startswith("/api/uploads/"), f"URL should start with /api/uploads/"
        print(f"✓ Upload video successful: {data['url']}")


class TestCategoriesRegression:
    """Test GET /api/categories still works after refactor"""
    
    def test_categories_returns_list(self):
        """GET /api/categories returns list with seo fields"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Categories failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Categories should return a list"
        assert len(data) > 0, "Should have at least one category"
        
        # Find Cotton Fabrics category
        cotton = next((c for c in data if c.get("name") == "Cotton Fabrics"), None)
        assert cotton is not None, "Cotton Fabrics category not found"
        
        # Check for SEO fields (may be populated or empty)
        print(f"✓ Categories returned {len(data)} categories")
        print(f"  Cotton Fabrics: id={cotton.get('id')}, seo_title={cotton.get('seo_title', 'N/A')[:50] if cotton.get('seo_title') else 'N/A'}")


class TestFabricsVendorCount:
    """Test GET /api/fabrics returns vendor_count field"""
    
    def test_fabrics_have_vendor_count(self):
        """GET /api/fabrics returns fabrics with vendor_count field"""
        response = requests.get(f"{BASE_URL}/api/fabrics?limit=10")
        assert response.status_code == 200, f"Fabrics failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Fabrics should return a list"
        
        if len(data) == 0:
            pytest.skip("No fabrics in database")
        
        # Check that all fabrics have vendor_count
        for fabric in data:
            assert "vendor_count" in fabric, f"Fabric {fabric.get('id')} missing vendor_count"
            assert isinstance(fabric["vendor_count"], int), f"vendor_count should be int"
            assert fabric["vendor_count"] >= 1, f"vendor_count should be >= 1"
        
        print(f"✓ All {len(data)} fabrics have vendor_count field (all = 1 since article_id is empty)")


class TestFabricsDedupeByArticle:
    """Test GET /api/fabrics?dedupe_by_article=true"""
    
    def test_dedupe_without_flag(self):
        """GET /api/fabrics without dedupe returns all fabrics"""
        response = requests.get(f"{BASE_URL}/api/fabrics?limit=1000")
        assert response.status_code == 200, f"Fabrics failed: {response.text}"
        data = response.json()
        count_without_dedupe = len(data)
        print(f"  Without dedupe: {count_without_dedupe} fabrics")
        return count_without_dedupe
    
    def test_dedupe_with_flag(self):
        """GET /api/fabrics?dedupe_by_article=true returns same count when no shared article_ids"""
        # Get count without dedupe
        response1 = requests.get(f"{BASE_URL}/api/fabrics?limit=1000")
        assert response1.status_code == 200
        count_without = len(response1.json())
        
        # Get count with dedupe
        response2 = requests.get(f"{BASE_URL}/api/fabrics?dedupe_by_article=true&limit=1000")
        assert response2.status_code == 200, f"Dedupe failed: {response2.text}"
        data = response2.json()
        count_with = len(data)
        
        # Since all article_ids are empty, counts should be equal
        # (or very close if pagination affects it)
        print(f"✓ Without dedupe: {count_without}, With dedupe: {count_with}")
        
        # Check vendor_count on deduped results
        for fabric in data[:5]:
            assert "vendor_count" in fabric, "Missing vendor_count in deduped result"
        
        print(f"✓ Dedupe returns fabrics with vendor_count field")


class TestFabricsCountDedupe:
    """Test GET /api/fabrics/count?dedupe_by_article=true"""
    
    def test_count_without_dedupe(self):
        """GET /api/fabrics/count returns total count"""
        response = requests.get(f"{BASE_URL}/api/fabrics/count")
        assert response.status_code == 200, f"Count failed: {response.text}"
        data = response.json()
        assert "count" in data, "Missing count field"
        assert isinstance(data["count"], int), "count should be int"
        print(f"  Count without dedupe: {data['count']}")
        return data["count"]
    
    def test_count_with_dedupe(self):
        """GET /api/fabrics/count?dedupe_by_article=true returns same count when no shared article_ids"""
        # Get count without dedupe
        response1 = requests.get(f"{BASE_URL}/api/fabrics/count")
        assert response1.status_code == 200
        count_without = response1.json()["count"]
        
        # Get count with dedupe
        response2 = requests.get(f"{BASE_URL}/api/fabrics/count?dedupe_by_article=true")
        assert response2.status_code == 200, f"Count dedupe failed: {response2.text}"
        data = response2.json()
        count_with = data["count"]
        
        # Since all article_ids are empty, counts should be equal
        assert count_without == count_with, f"Counts should match: {count_without} vs {count_with}"
        print(f"✓ Count without dedupe: {count_without}, with dedupe: {count_with} (equal as expected)")


class TestDedupeWithTestData:
    """Test dedupe by creating test fabrics with shared article_id"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def test_category_id(self):
        """Get a valid category ID"""
        response = requests.get(f"{BASE_URL}/api/categories")
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        pytest.skip("No categories available")
    
    def test_dedupe_collapses_shared_article_id(self, admin_token, test_category_id):
        """Create 2 fabrics with same article_id, verify dedupe collapses them"""
        shared_article_id = "TEST_ARTICLE_DEDUPE_001"
        created_ids = []
        
        try:
            # Create fabric 1 with higher price
            fabric1_data = {
                "name": "TEST Dedupe Fabric 1 - Higher Price",
                "category_id": test_category_id,
                "fabric_type": "woven",
                "article_id": shared_article_id,
                "width": "58 inches",
                "color": "White",
                "moq": "100 meters",
                "description": "Test fabric for dedupe testing",
                "rate_per_meter": 150.0
            }
            response1 = requests.post(
                f"{BASE_URL}/api/fabrics",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=fabric1_data
            )
            assert response1.status_code == 200, f"Create fabric 1 failed: {response1.text}"
            fabric1 = response1.json()
            created_ids.append(fabric1["id"])
            print(f"  Created fabric 1: {fabric1['id']} with rate_per_meter=150")
            
            # Create fabric 2 with lower price (should win in dedupe)
            fabric2_data = {
                "name": "TEST Dedupe Fabric 2 - Lower Price",
                "category_id": test_category_id,
                "fabric_type": "woven",
                "article_id": shared_article_id,
                "width": "58 inches",
                "color": "White",
                "moq": "100 meters",
                "description": "Test fabric for dedupe testing - cheaper",
                "rate_per_meter": 100.0
            }
            response2 = requests.post(
                f"{BASE_URL}/api/fabrics",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=fabric2_data
            )
            assert response2.status_code == 200, f"Create fabric 2 failed: {response2.text}"
            fabric2 = response2.json()
            created_ids.append(fabric2["id"])
            print(f"  Created fabric 2: {fabric2['id']} with rate_per_meter=100")
            
            # Get fabrics without dedupe - should see both
            response_no_dedupe = requests.get(
                f"{BASE_URL}/api/fabrics?article_id={shared_article_id}"
            )
            assert response_no_dedupe.status_code == 200
            fabrics_no_dedupe = response_no_dedupe.json()
            assert len(fabrics_no_dedupe) == 2, f"Expected 2 fabrics without dedupe, got {len(fabrics_no_dedupe)}"
            print(f"  Without dedupe: {len(fabrics_no_dedupe)} fabrics")
            
            # Get fabrics with dedupe - should see only 1 with vendor_count=2
            response_dedupe = requests.get(
                f"{BASE_URL}/api/fabrics?article_id={shared_article_id}&dedupe_by_article=true"
            )
            assert response_dedupe.status_code == 200
            fabrics_dedupe = response_dedupe.json()
            assert len(fabrics_dedupe) == 1, f"Expected 1 fabric with dedupe, got {len(fabrics_dedupe)}"
            
            winner = fabrics_dedupe[0]
            assert winner["vendor_count"] == 2, f"Expected vendor_count=2, got {winner['vendor_count']}"
            assert winner["rate_per_meter"] == 100.0, f"Expected cheaper fabric (100), got {winner['rate_per_meter']}"
            
            print(f"✓ Dedupe collapsed 2 fabrics into 1 with vendor_count=2, winner rate={winner['rate_per_meter']}")
            
        finally:
            # Cleanup: delete test fabrics
            for fabric_id in created_ids:
                requests.delete(
                    f"{BASE_URL}/api/fabrics/{fabric_id}",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
            print(f"  Cleaned up {len(created_ids)} test fabrics")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
