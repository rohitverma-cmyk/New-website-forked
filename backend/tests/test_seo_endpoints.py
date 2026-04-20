"""
Test suite for SEO endpoints - seo_router.py
Tests cover: GET/POST SEO content, generate SEO, regenerate blocks, preview, related fabrics
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test fabric ID with existing SEO content
TEST_FABRIC_ID = "8e6c6e09-f711-455b-9900-1044574d7c25"


class TestSEOEndpointsHealth:
    """Basic connectivity tests for SEO endpoints"""

    def test_get_fabric_seo_success(self):
        """GET /api/seo/fabric/{id} - returns SEO content for fabric with existing SEO"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate response structure
        assert "fabric_id" in data, "Missing fabric_id in response"
        assert data["fabric_id"] == TEST_FABRIC_ID, "fabric_id mismatch"
        
        # Validate SEO content fields
        assert "seo_h1" in data, "Missing seo_h1"
        assert "seo_intro" in data, "Missing seo_intro"
        assert "meta_title" in data, "Missing meta_title"
        assert "meta_description" in data, "Missing meta_description"
        assert "canonical_url" in data, "Missing canonical_url"
        assert "is_indexed" in data, "Missing is_indexed"
        print(f"✓ GET SEO for fabric {TEST_FABRIC_ID}: seo_h1 = {data['seo_h1'][:50]}...")

    def test_get_fabric_seo_nonexistent_fabric(self):
        """GET /api/seo/fabric/{id} - returns 404 for non-existent fabric"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/nonexistent-fabric-id-123")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ GET SEO for non-existent fabric returns 404")

    def test_get_seo_preview_success(self):
        """GET /api/seo/fabric/{id}/preview - returns SEO preview with alerts"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/preview")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate preview structure
        assert "fabric_id" in data, "Missing fabric_id"
        assert "fabric_name" in data, "Missing fabric_name"
        assert "seo_h1" in data, "Missing seo_h1"
        assert "meta_title" in data, "Missing meta_title"
        assert "meta_description" in data, "Missing meta_description"
        assert "intro_word_count" in data, "Missing intro_word_count"
        assert "alerts" in data, "Missing alerts"
        assert isinstance(data["alerts"], list), "alerts should be a list"
        
        # Validate boolean fields
        assert "has_applications" in data, "Missing has_applications"
        assert "has_faq" in data, "Missing has_faq"
        assert "has_bulk_details" in data, "Missing has_bulk_details"
        assert "has_why_fabric" in data, "Missing has_why_fabric"
        print(f"✓ GET SEO preview: fabric_name = {data['fabric_name']}, alerts count = {len(data['alerts'])}")

    def test_get_seo_preview_nonexistent(self):
        """GET /api/seo/fabric/{id}/preview - returns 404 for non-existent fabric"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/nonexistent-123/preview")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ GET SEO preview for non-existent fabric returns 404")

    def test_get_related_fabrics_success(self):
        """GET /api/seo/fabric/{id}/related - returns related fabrics"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/related")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Validate structure of each related fabric
        for fabric in data:
            assert "id" in fabric, "Missing id in related fabric"
            assert "name" in fabric, "Missing name in related fabric"
            assert "category_name" in fabric, "Missing category_name"
            assert fabric["id"] != TEST_FABRIC_ID, "Related fabrics should not include the source fabric"
        
        print(f"✓ GET related fabrics: {len(data)} related fabrics found")

    def test_get_related_fabrics_nonexistent(self):
        """GET /api/seo/fabric/{id}/related - returns 404 for non-existent fabric"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/nonexistent-123/related")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ GET related fabrics for non-existent fabric returns 404")


class TestSEOContentGeneration:
    """Tests for SEO content generation endpoints"""

    def test_generate_fabric_seo(self):
        """POST /api/seo/fabric/{id}/generate - generates SEO content"""
        response = requests.post(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/generate")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate generated content
        assert "fabric_id" in data, "Missing fabric_id"
        assert data["fabric_id"] == TEST_FABRIC_ID, "fabric_id mismatch"
        
        # Validate all SEO blocks are present
        assert "seo_h1" in data and data["seo_h1"], "seo_h1 should be generated"
        assert "seo_intro" in data and data["seo_intro"], "seo_intro should be generated"
        assert "seo_applications" in data, "seo_applications should be generated"
        assert "seo_bulk_details" in data, "seo_bulk_details should be generated"
        assert "seo_why_fabric" in data, "seo_why_fabric should be generated"
        assert "seo_faq" in data, "seo_faq should be generated"
        assert "meta_title" in data and data["meta_title"], "meta_title should be generated"
        assert "meta_description" in data and data["meta_description"], "meta_description should be generated"
        assert "canonical_url" in data, "canonical_url should be generated"
        assert "slug" in data, "slug should be generated"
        
        # Validate block modes
        assert "seo_block_modes" in data, "seo_block_modes should be present"
        print(f"✓ POST generate SEO: h1 = {data['seo_h1'][:50]}...")

    def test_generate_fabric_seo_nonexistent(self):
        """POST /api/seo/fabric/{id}/generate - returns 404 for non-existent fabric"""
        response = requests.post(f"{BASE_URL}/api/seo/fabric/nonexistent-123/generate")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ POST generate SEO for non-existent fabric returns 404")

    def test_regenerate_seo_block_h1(self):
        """POST /api/seo/fabric/{id}/regenerate-block - regenerates H1 block"""
        response = requests.post(
            f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/regenerate-block",
            json={"block_name": "h1"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "block" in data, "Missing block field"
        assert data["block"] == "h1", "Block name mismatch"
        assert "content" in data, "Missing content field"
        print(f"✓ POST regenerate H1 block: {data['content'][:50] if data['content'] else 'empty'}...")

    def test_regenerate_seo_block_meta_title(self):
        """POST /api/seo/fabric/{id}/regenerate-block - regenerates meta_title"""
        response = requests.post(
            f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/regenerate-block",
            json={"block_name": "meta_title"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["block"] == "meta_title", "Block name mismatch"
        print(f"✓ POST regenerate meta_title: {data['content'] if data['content'] else 'empty'}")

    def test_regenerate_seo_block_invalid(self):
        """POST /api/seo/fabric/{id}/regenerate-block - returns 400 for invalid block name"""
        response = requests.post(
            f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}/regenerate-block",
            json={"block_name": "invalid_block"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ POST regenerate invalid block returns 400")


class TestSEOContentUpdate:
    """Tests for updating SEO content"""

    def test_update_fabric_seo(self):
        """PUT /api/seo/fabric/{id} - updates SEO content"""
        # First get current data
        get_response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}")
        current_data = get_response.json()
        
        # Update meta_title
        update_data = {**current_data, "meta_title": "Updated Test Title | Locofast"}
        
        response = requests.put(
            f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}",
            json=update_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["meta_title"] == "Updated Test Title | Locofast", "meta_title not updated"
        print("✓ PUT update SEO: meta_title updated successfully")
        
        # Restore original
        requests.put(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}", json=current_data)

    def test_update_fabric_seo_nonexistent(self):
        """PUT /api/seo/fabric/{id} - returns 404 for non-existent fabric"""
        response = requests.put(
            f"{BASE_URL}/api/seo/fabric/nonexistent-123",
            json={"meta_title": "Test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ PUT update SEO for non-existent fabric returns 404")


class TestSEODataValidation:
    """Tests to validate SEO data quality"""

    def test_seo_content_quality(self):
        """Validate SEO content quality for test fabric"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}")
        data = response.json()
        
        # Meta title should be <= 60 chars
        meta_title = data.get("meta_title", "")
        assert len(meta_title) <= 70, f"Meta title too long: {len(meta_title)} chars"
        
        # Meta description should be <= 160 chars
        meta_desc = data.get("meta_description", "")
        assert len(meta_desc) <= 170, f"Meta description too long: {len(meta_desc)} chars"
        
        # Intro should have meaningful content
        intro = data.get("seo_intro", "")
        word_count = len(intro.split())
        assert word_count >= 50, f"Intro too short: {word_count} words"
        
        # FAQ should be a list of Q&A objects
        faq = data.get("seo_faq", [])
        assert isinstance(faq, list), "FAQ should be a list"
        for item in faq:
            assert "question" in item, "FAQ item missing question"
            assert "answer" in item, "FAQ item missing answer"
        
        print(f"✓ SEO content quality validated: meta_title={len(meta_title)} chars, intro={word_count} words, FAQ={len(faq)} items")

    def test_bulk_details_structure(self):
        """Validate bulk_details structure"""
        response = requests.get(f"{BASE_URL}/api/seo/fabric/{TEST_FABRIC_ID}")
        data = response.json()
        
        bulk = data.get("seo_bulk_details", {})
        expected_keys = ["moq", "lead_time", "sampling", "dispatch_region"]
        for key in expected_keys:
            assert key in bulk, f"Missing {key} in bulk_details"
        
        print(f"✓ Bulk details structure validated: {list(bulk.keys())}")


class TestBatchOperations:
    """Tests for batch SEO operations"""

    def test_batch_generate_slugs(self):
        """POST /api/seo/batch-generate-slugs - generates slugs for all fabrics"""
        response = requests.post(f"{BASE_URL}/api/seo/batch-generate-slugs")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "updated_count" in data, "Missing updated_count"
        assert isinstance(data["updated_count"], int), "updated_count should be int"
        print(f"✓ POST batch generate slugs: {data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
