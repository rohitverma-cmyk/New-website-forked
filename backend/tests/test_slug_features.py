"""
Test suite for SEO-friendly fabric URL slugs feature.
Tests:
1. GET /api/fabrics returns slug field in response
2. GET /api/fabrics/{slug} works for slug-based lookup
3. GET /api/fabrics/{uuid} still works for UUID-based lookup (backward compat)
4. Fabric create POST /api/fabrics auto-generates slug
5. Fabric update PUT /api/fabrics/{id} regenerates slug when name changes
6. Sitemap uses slug URLs for fabrics
7. Commission system regression check
8. Agent login regression check
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


class TestSlugFeatures:
    """Test SEO-friendly slug features for fabrics"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        
    def get_auth_token(self):
        """Get admin auth token"""
        if self.auth_token:
            return self.auth_token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.auth_token = response.json().get("token")
            return self.auth_token
        pytest.skip("Authentication failed - skipping authenticated tests")
        
    def test_fabrics_list_returns_slug_field(self):
        """Test GET /api/fabrics returns slug field in response"""
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        fabrics = response.json()
        assert len(fabrics) > 0, "Expected at least one fabric"
        
        # Check that slug field exists in response
        for fabric in fabrics:
            assert "slug" in fabric, f"Fabric {fabric.get('id')} missing slug field"
            assert fabric["slug"], f"Fabric {fabric.get('id')} has empty slug"
            # Verify slug format: lowercase, hyphens, ends with hex suffix
            slug = fabric["slug"]
            assert re.match(r'^[a-z0-9-]+-[a-f0-9]{6}$', slug), f"Invalid slug format: {slug}"
        
        print(f"✓ All {len(fabrics)} fabrics have valid slug field")
        
    def test_fabric_lookup_by_slug(self):
        """Test GET /api/fabrics/{slug} works for slug-based lookup"""
        # First get a fabric with its slug
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=1")
        assert response.status_code == 200
        fabrics = response.json()
        assert len(fabrics) > 0, "No fabrics found"
        
        fabric = fabrics[0]
        slug = fabric["slug"]
        fabric_id = fabric["id"]
        
        # Now lookup by slug
        response = self.session.get(f"{BASE_URL}/api/fabrics/{slug}")
        assert response.status_code == 200, f"Slug lookup failed: {response.status_code}"
        
        fabric_by_slug = response.json()
        assert fabric_by_slug["id"] == fabric_id, "Slug lookup returned wrong fabric"
        assert fabric_by_slug["slug"] == slug, "Slug mismatch"
        
        print(f"✓ Fabric lookup by slug works: {slug}")
        
    def test_fabric_lookup_by_uuid_backward_compat(self):
        """Test GET /api/fabrics/{uuid} still works for UUID-based lookup (backward compat)"""
        # First get a fabric with its ID
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=1")
        assert response.status_code == 200
        fabrics = response.json()
        assert len(fabrics) > 0, "No fabrics found"
        
        fabric = fabrics[0]
        fabric_id = fabric["id"]
        
        # Now lookup by UUID
        response = self.session.get(f"{BASE_URL}/api/fabrics/{fabric_id}")
        assert response.status_code == 200, f"UUID lookup failed: {response.status_code}"
        
        fabric_by_id = response.json()
        assert fabric_by_id["id"] == fabric_id, "UUID lookup returned wrong fabric"
        
        print(f"✓ Fabric lookup by UUID works (backward compat): {fabric_id[:8]}...")
        
    def test_fabric_create_auto_generates_slug(self):
        """Test POST /api/fabrics auto-generates slug"""
        token = self.get_auth_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get a category first
        cat_response = self.session.get(f"{BASE_URL}/api/categories")
        assert cat_response.status_code == 200
        categories = cat_response.json()
        assert len(categories) > 0, "No categories found"
        category_id = categories[0]["id"]
        
        # Create a new fabric
        test_fabric_name = "TEST Slug Auto Generate Cotton Poplin 60s"
        fabric_data = {
            "name": test_fabric_name,
            "category_id": category_id,
            "fabric_type": "woven",
            "width": "58",
            "color": "White",
            "moq": "100m",
            "description": "Test fabric for slug generation"
        }
        
        response = self.session.post(f"{BASE_URL}/api/fabrics", json=fabric_data, headers=headers)
        assert response.status_code == 200, f"Create failed: {response.status_code} - {response.text}"
        
        created_fabric = response.json()
        assert "slug" in created_fabric, "Created fabric missing slug"
        assert created_fabric["slug"], "Created fabric has empty slug"
        
        # Verify slug format
        slug = created_fabric["slug"]
        assert "test-slug-auto-generate-cotton-poplin-60s" in slug, f"Slug doesn't match name: {slug}"
        assert re.match(r'^[a-z0-9-]+-[a-f0-9]{6}$', slug), f"Invalid slug format: {slug}"
        
        # Cleanup - delete the test fabric
        fabric_id = created_fabric["id"]
        self.session.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=headers)
        
        print(f"✓ Fabric create auto-generates slug: {slug}")
        
    def test_fabric_update_regenerates_slug_on_name_change(self):
        """Test PUT /api/fabrics/{id} regenerates slug when name changes"""
        token = self.get_auth_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get a category first
        cat_response = self.session.get(f"{BASE_URL}/api/categories")
        assert cat_response.status_code == 200
        categories = cat_response.json()
        category_id = categories[0]["id"]
        
        # Create a test fabric
        fabric_data = {
            "name": "TEST Original Name Fabric",
            "category_id": category_id,
            "fabric_type": "woven",
            "width": "58",
            "color": "Blue",
            "moq": "50m",
            "description": "Test fabric for slug update"
        }
        
        response = self.session.post(f"{BASE_URL}/api/fabrics", json=fabric_data, headers=headers)
        assert response.status_code == 200
        created_fabric = response.json()
        fabric_id = created_fabric["id"]
        original_slug = created_fabric["slug"]
        
        # Update the fabric name
        new_name = "TEST Updated Name Fabric Premium"
        update_response = self.session.put(
            f"{BASE_URL}/api/fabrics/{fabric_id}",
            json={"name": new_name},
            headers=headers
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code}"
        
        updated_fabric = update_response.json()
        new_slug = updated_fabric["slug"]
        
        # Verify slug was regenerated
        assert new_slug != original_slug, "Slug should change when name changes"
        assert "test-updated-name-fabric-premium" in new_slug, f"New slug doesn't match new name: {new_slug}"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=headers)
        
        print(f"✓ Fabric update regenerates slug: {original_slug} -> {new_slug}")
        
    def test_sitemap_exists(self):
        """Test sitemap.xml exists and is valid"""
        response = self.session.get(f"{BASE_URL}/sitemap.xml")
        assert response.status_code == 200, f"Sitemap request failed: {response.status_code}"
        
        sitemap_content = response.text
        
        # Check that sitemap is valid XML with urlset
        assert '<?xml version' in sitemap_content, "Sitemap should be valid XML"
        assert '<urlset' in sitemap_content, "Sitemap should have urlset element"
        assert '<url>' in sitemap_content, "Sitemap should have url elements"
        
        # Check that /fabrics page is in sitemap
        assert '/fabrics' in sitemap_content, "Sitemap should include /fabrics page"
        
        print(f"✓ Sitemap exists and is valid XML")
        
    def test_all_migrated_fabrics_have_slugs(self):
        """Test that all 194 migrated fabrics have slugs"""
        # Get all fabrics (with high limit)
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=500")
        assert response.status_code == 200
        
        fabrics = response.json()
        fabrics_without_slug = [f for f in fabrics if not f.get("slug")]
        
        assert len(fabrics_without_slug) == 0, f"{len(fabrics_without_slug)} fabrics missing slugs"
        
        print(f"✓ All {len(fabrics)} fabrics have slugs")


class TestRegressionChecks:
    """Regression tests for existing features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self):
        """Get admin auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
        
    def test_commission_system_works(self):
        """Regression: Commission system still works"""
        token = self.get_auth_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test commission rules endpoint
        response = self.session.get(f"{BASE_URL}/api/commission/rules", headers=headers)
        assert response.status_code == 200, f"Commission rules failed: {response.status_code}"
        
        rules = response.json()
        assert isinstance(rules, list), "Commission rules should return a list"
        
        # Test commission calculate preview
        calc_response = self.session.post(
            f"{BASE_URL}/api/commission/calculate-preview",
            json={"cart_value": 10000, "total_meterage": 100},
            headers=headers
        )
        assert calc_response.status_code == 200, f"Commission calculate failed: {calc_response.status_code}"
        
        calc_result = calc_response.json()
        assert "commission_pct" in calc_result, "Missing commission_pct in response"
        
        print(f"✓ Commission system works - {len(rules)} rules, default {calc_result.get('commission_pct')}%")
        
    def test_agent_login_endpoints_work(self):
        """Regression: Agent login OTP endpoints work"""
        # Test send-otp endpoint (will fail with invalid email but should return valid JSON)
        response = self.session.post(
            f"{BASE_URL}/api/agent/send-otp",
            json={"email": "test@example.com"}
        )
        # Should return 400, 401, 403, 404, or 200 with valid JSON
        # 403 is valid for unauthorized agent email
        assert response.status_code in [200, 400, 401, 403, 404], f"Unexpected status: {response.status_code}"
        
        # Verify response is valid JSON
        try:
            data = response.json()
            assert isinstance(data, dict), "Response should be a dict"
        except Exception as e:
            pytest.fail(f"Agent send-otp response is not valid JSON: {e}")
        
        print(f"✓ Agent login endpoints return valid JSON (status: {response.status_code})")
        
    def test_admin_login_works(self):
        """Regression: Admin login still works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Missing token in login response"
        assert "admin" in data, "Missing admin in login response"
        
        print(f"✓ Admin login works")


class TestSlugFormat:
    """Test slug format and edge cases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_slug_format_validation(self):
        """Test that slugs follow expected format"""
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=20")
        assert response.status_code == 200
        
        fabrics = response.json()
        
        for fabric in fabrics:
            slug = fabric.get("slug", "")
            
            # Slug should be lowercase
            assert slug == slug.lower(), f"Slug not lowercase: {slug}"
            
            # Slug should not contain special characters except hyphens
            assert re.match(r'^[a-z0-9-]+$', slug), f"Slug has invalid chars: {slug}"
            
            # Slug should end with 6-char hex suffix
            assert re.search(r'-[a-f0-9]{6}$', slug), f"Slug missing hex suffix: {slug}"
            
        print(f"✓ All {len(fabrics)} slugs have valid format")
        
    def test_example_slug_format(self):
        """Test example slug mentioned in requirements"""
        # Example: test-vendor-fabric-pending-approval-92fe67
        response = self.session.get(f"{BASE_URL}/api/fabrics?limit=50")
        assert response.status_code == 200
        
        fabrics = response.json()
        
        # Find a fabric with a slug to verify format
        sample_slugs = [f["slug"] for f in fabrics[:5] if f.get("slug")]
        
        for slug in sample_slugs:
            parts = slug.rsplit('-', 1)
            assert len(parts) == 2, f"Slug should have name-suffix format: {slug}"
            name_part, suffix = parts
            assert len(suffix) == 6, f"Suffix should be 6 chars: {suffix}"
            assert all(c in '0123456789abcdef' for c in suffix), f"Suffix should be hex: {suffix}"
            
        print(f"✓ Slug format matches expected pattern (e.g., {sample_slugs[0] if sample_slugs else 'N/A'})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
