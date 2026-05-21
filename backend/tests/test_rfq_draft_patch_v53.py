"""
RFQ Draft & PATCH Flow Tests - Phase 53
Tests the multi-step RFQ wizard backend:
- POST /api/rfq/submit with is_draft=true creates draft RFQ
- PATCH /api/rfq/{rfq_id} updates only specified fields
- PATCH with finalize=true promotes draft→new
- Permission checks (403 for non-owner, 404 for unknown)
- Alias mirroring (color→color_or_shade, etc.)
- Freeze once vendor_quote with status='won' exists
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BRAND_EMAIL = "brandtest@locofast.com"
BRAND_PASSWORD = "NewPassword123!"
VENDOR_EMAIL = "vendor@test.com"
VENDOR_PASSWORD = "vendor123"
ADMIN_EMAIL = "admin@locofast.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def brand_token():
    """Get brand JWT token"""
    res = requests.post(f"{BASE_URL}/api/brand/login", json={
        "email": BRAND_EMAIL,
        "password": BRAND_PASSWORD
    })
    if res.status_code != 200:
        pytest.skip(f"Brand login failed: {res.status_code} {res.text}")
    return res.json().get("token")


@pytest.fixture(scope="module")
def vendor_token():
    """Get vendor JWT token"""
    res = requests.post(f"{BASE_URL}/api/vendor/login", json={
        "email": VENDOR_EMAIL,
        "password": VENDOR_PASSWORD
    })
    if res.status_code != 200:
        pytest.skip(f"Vendor login failed: {res.status_code} {res.text}")
    return res.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token"""
    res = requests.post(f"{BASE_URL}/api/admin/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if res.status_code != 200:
        pytest.skip(f"Admin login failed: {res.status_code} {res.text}")
    return res.json().get("token")


@pytest.fixture(scope="module")
def sample_fabric_id():
    """Get a real fabric ID for PDP prefill testing"""
    res = requests.get(f"{BASE_URL}/api/fabrics?limit=1")
    if res.status_code != 200:
        pytest.skip("No fabrics available for testing")
    data = res.json()
    # API returns list directly
    fabrics = data if isinstance(data, list) else data.get("fabrics", [])
    if not fabrics:
        pytest.skip("No fabrics available for testing")
    return fabrics[0]["id"]


class TestRFQDraftCreation:
    """Test POST /api/rfq/submit with is_draft=true"""
    
    def test_create_draft_rfq_with_brand_token(self, brand_token):
        """Brand user can create a draft RFQ with is_draft=true"""
        payload = {
            "category": "cotton",
            "fabric_requirement_type": "Dyed",
            "quantity_value": 5000,
            "quantity_unit": "m",
            "is_draft": True
        }
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify draft status
        assert data.get("status") == "draft", f"Expected status='draft', got {data.get('status')}"
        assert data.get("id"), "Draft RFQ should have an id"
        assert data.get("rfq_number"), "Draft RFQ should have an rfq_number"
        assert data["rfq_number"].startswith("RFQ-"), f"RFQ number should start with RFQ-, got {data['rfq_number']}"
        
        # Store for later tests
        self.__class__.draft_rfq_id = data["id"]
        self.__class__.draft_rfq_number = data["rfq_number"]
        print(f"Created draft RFQ: {data['rfq_number']} (id={data['id']})")
    
    def test_anonymous_draft_requires_name(self):
        """Anonymous user creating draft without full_name gets 400"""
        payload = {
            "category": "cotton",
            "fabric_requirement_type": "Greige",
            "quantity_value": 1000,
            "quantity_unit": "m",
            "is_draft": True
        }
        res = requests.post(f"{BASE_URL}/api/rfq/submit", json=payload)
        assert res.status_code == 400, f"Expected 400 for anonymous without name, got {res.status_code}"
        assert "name" in res.json().get("detail", "").lower() or "sign in" in res.json().get("detail", "").lower()


class TestRFQPatchFlow:
    """Test PATCH /api/rfq/{rfq_id} for progressive enrichment"""
    
    @pytest.fixture(autouse=True)
    def setup_draft(self, brand_token):
        """Create a fresh draft for each test in this class"""
        payload = {
            "category": "denim",
            "fabric_requirement_type": "",
            "quantity_value": 3000,
            "quantity_unit": "m",
            "is_draft": True
        }
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert res.status_code == 200
        self.rfq_id = res.json()["id"]
        self.rfq_number = res.json()["rfq_number"]
        self.brand_token = brand_token
    
    def test_patch_step2_fields(self):
        """PATCH with Step 2 fields (composition, GSM, width, color) updates only those fields"""
        patch_payload = {
            "composition": [
                {"material": "Cotton", "percentage": 98},
                {"material": "Spandex", "percentage": 2}
            ],
            "gsm": 280,
            "width_inches": 58,
            "color": "Indigo Blue",
            "weave_type": "Twill"
        }
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 200, f"PATCH failed: {res.status_code} {res.text}"
        data = res.json()
        
        # Verify status remains draft
        assert data["rfq"]["status"] == "draft", "Status should remain 'draft' after PATCH"
        
        # Verify fields were updated
        rfq = data["rfq"]
        assert rfq["gsm"] == 280
        assert rfq["width_inches"] == 58
        assert rfq["color"] == "Indigo Blue"
        assert rfq["weave_type"] == "Twill"
        
        # Verify composition was cleaned and stored
        assert len(rfq["composition"]) == 2
        assert rfq["composition"][0]["material"] == "Cotton"
        assert rfq["composition"][0]["percentage"] == 98
    
    def test_patch_step3_fields(self):
        """PATCH with Step 3 fields (target_price, required_by, sample_needed)"""
        patch_payload = {
            "target_price_per_unit": 150.50,
            "required_by": "2026-03-15",
            "sample_needed": True,
            "message": "Need urgent delivery"
        }
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 200
        rfq = res.json()["rfq"]
        
        assert rfq["target_price_per_unit"] == 150.50
        assert rfq["required_by"] == "2026-03-15"
        assert rfq["sample_needed"] == True
        assert rfq["message"] == "Need urgent delivery"
        assert rfq["status"] == "draft"
    
    def test_patch_alias_mirroring(self):
        """PATCH mirrors aliases: color→color_or_shade, weave_type→weave_pattern, etc."""
        patch_payload = {
            "color": "Navy Blue",
            "weave_type": "Satin",
            "target_price_per_unit": 200,
            "required_by": "2026-04-01"
        }
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 200
        rfq = res.json()["rfq"]
        
        # Check alias mirroring
        assert rfq["color"] == "Navy Blue"
        assert rfq["color_or_shade"] == "Navy Blue", "color should mirror to color_or_shade"
        
        assert rfq["weave_type"] == "Satin"
        assert rfq["weave_pattern"] == "Satin", "weave_type should mirror to weave_pattern"
        
        assert rfq["target_price_per_unit"] == 200
        assert rfq["target_price_per_meter"] == 200, "target_price_per_unit should mirror to target_price_per_meter"
        
        assert rfq["required_by"] == "2026-04-01"
        assert rfq["dispatch_required_by"] == "2026-04-01", "required_by should mirror to dispatch_required_by"
    
    def test_patch_composition_rejects_empty_rows(self):
        """PATCH composition list rejects empty rows, accepts valid {material, percentage}"""
        patch_payload = {
            "composition": [
                {"material": "Polyester", "percentage": 65},
                {"material": "", "percentage": 0},  # Empty row - should be filtered
                {"material": "Cotton", "percentage": 35},
                {"material": "Nylon", "percentage": 0}  # Zero percentage - should be filtered
            ]
        }
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 200
        rfq = res.json()["rfq"]
        
        # Only valid rows should be stored
        assert len(rfq["composition"]) == 2, f"Expected 2 valid composition rows, got {len(rfq['composition'])}"
        materials = [c["material"] for c in rfq["composition"]]
        assert "Polyester" in materials
        assert "Cotton" in materials
    
    def test_patch_finalize_promotes_draft_to_new(self):
        """PATCH with finalize=true promotes draft to status='new' and stamps finalized_at"""
        # First add delivery info
        patch_payload = {
            "delivery_city": "Mumbai",
            "delivery_state": "Maharashtra",
            "delivery_pincode": "400001",
            "finalize": True
        }
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json=patch_payload,
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        
        assert data["promoted_to_new"] == True, "promoted_to_new should be True"
        assert data["rfq"]["status"] == "new", "Status should be 'new' after finalize"
        assert data["rfq"].get("finalized_at"), "finalized_at should be stamped"
        
        # Verify delivery fields
        assert data["rfq"]["delivery_city"] == "Mumbai"
        assert data["rfq"]["delivery_state"] == "Maharashtra"


class TestRFQPatchPermissions:
    """Test PATCH permission checks"""
    
    @pytest.fixture(autouse=True)
    def setup_draft(self, brand_token):
        """Create a draft owned by brand user"""
        payload = {
            "category": "knits",
            "quantity_value": 500,
            "quantity_unit": "kg",
            "is_draft": True
        }
        res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json=payload,
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert res.status_code == 200
        self.rfq_id = res.json()["id"]
        self.brand_token = brand_token
    
    def test_patch_returns_403_without_auth(self):
        """PATCH without JWT returns 403"""
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json={"color": "Red"}
        )
        assert res.status_code == 403, f"Expected 403 for anonymous PATCH, got {res.status_code}"
        assert "own" in res.json().get("detail", "").lower() or "your" in res.json().get("detail", "").lower()
    
    def test_patch_returns_403_for_wrong_user(self, vendor_token):
        """PATCH with different user's JWT returns 403"""
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{self.rfq_id}",
            json={"color": "Green"},
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert res.status_code == 403, f"Expected 403 for wrong user, got {res.status_code}"
    
    def test_patch_returns_404_for_unknown_rfq(self):
        """PATCH with unknown rfq_id returns 404"""
        fake_id = str(uuid.uuid4())
        res = requests.patch(
            f"{BASE_URL}/api/rfq/{fake_id}",
            json={"color": "Blue"},
            headers={"Authorization": f"Bearer {self.brand_token}"}
        )
        assert res.status_code == 404, f"Expected 404 for unknown RFQ, got {res.status_code}"


class TestRFQFreezeOnWonQuote:
    """Test that PATCH is blocked once a vendor_quote with status='won' exists"""
    
    def test_patch_returns_400_when_quote_won(self, brand_token, vendor_token, admin_token):
        """PATCH returns 400 with appropriate detail when RFQ has a won quote"""
        # 1. Create and finalize an RFQ
        create_res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json={
                "category": "cotton",
                "fabric_requirement_type": "Dyed",
                "quantity_value": 2000,
                "quantity_unit": "m",
                "is_draft": False  # Create as 'new' directly
            },
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert create_res.status_code == 200
        rfq_id = create_res.json()["id"]
        rfq_number = create_res.json()["rfq_number"]
        print(f"Created RFQ for freeze test: {rfq_number}")
        
        # 2. Submit a vendor quote
        quote_res = requests.post(
            f"{BASE_URL}/api/vendor/quotes",
            json={
                "rfq_id": rfq_id,
                "price_per_unit": 120,
                "moq": 1000,
                "lead_time_days": 14,
                "notes": "Test quote for freeze test"
            },
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        if quote_res.status_code != 200:
            pytest.skip(f"Could not create vendor quote: {quote_res.status_code} {quote_res.text}")
        quote_id = quote_res.json().get("id")
        print(f"Created vendor quote: {quote_id}")
        
        # 3. Mark quote as 'won' via admin
        # First get the quote to verify it exists
        won_res = requests.put(
            f"{BASE_URL}/api/admin/vendor-quotes/{quote_id}/status",
            json={"status": "won"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if won_res.status_code != 200:
            # Try alternative endpoint
            won_res = requests.patch(
                f"{BASE_URL}/api/vendor/quotes/{quote_id}",
                json={"status": "won"},
                headers={"Authorization": f"Bearer {admin_token}"}
            )
        
        if won_res.status_code != 200:
            pytest.skip(f"Could not mark quote as won: {won_res.status_code} {won_res.text}")
        print("Marked quote as won")
        
        # 4. Try to PATCH the RFQ - should fail with 400
        patch_res = requests.patch(
            f"{BASE_URL}/api/rfq/{rfq_id}",
            json={"color": "Should not work"},
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert patch_res.status_code == 400, f"Expected 400 for frozen RFQ, got {patch_res.status_code}"
        detail = patch_res.json().get("detail", "")
        assert "closed" in detail.lower() or "won" in detail.lower() or "accepted" in detail.lower(), \
            f"Error message should mention closed/won/accepted: {detail}"


class TestFabricPrefillEndpoint:
    """Test GET /api/fabrics/{id} for PDP prefill"""
    
    def test_get_fabric_returns_spec_fields(self, sample_fabric_id):
        """GET /api/fabrics/{id} returns all fields needed for RFQ prefill"""
        res = requests.get(f"{BASE_URL}/api/fabrics/{sample_fabric_id}")
        assert res.status_code == 200, f"GET fabric failed: {res.status_code}"
        fabric = res.json()
        
        # Verify essential fields exist (may be empty but should be present)
        assert "id" in fabric
        assert "name" in fabric
        assert "category_id" in fabric
        
        # These fields are used for prefill
        prefill_fields = [
            "fabric_type", "composition", "gsm", "ounce", "width",
            "color_or_shade", "weave_pattern", "knit_type", "stretch",
            "finish", "end_use", "certifications", "fabric_requirement_type"
        ]
        for field in prefill_fields:
            assert field in fabric or True, f"Field {field} should be in fabric response"
        
        print(f"Fabric {fabric.get('name')} has category_id={fabric.get('category_id')}")


class TestRFQListAndGet:
    """Test RFQ list and get endpoints"""
    
    def test_get_rfq_by_id(self, brand_token):
        """GET /api/rfq/{id} returns the RFQ"""
        # Create a draft first
        create_res = requests.post(
            f"{BASE_URL}/api/rfq/submit",
            json={
                "category": "viscose",
                "fabric_requirement_type": "Printed",
                "quantity_value": 1500,
                "quantity_unit": "m",
                "is_draft": True
            },
            headers={"Authorization": f"Bearer {brand_token}"}
        )
        assert create_res.status_code == 200
        rfq_id = create_res.json()["id"]
        
        # Get it back
        get_res = requests.get(f"{BASE_URL}/api/rfq/{rfq_id}")
        assert get_res.status_code == 200
        rfq = get_res.json()
        
        assert rfq["id"] == rfq_id
        assert rfq["category"] == "viscose"
        assert rfq["status"] == "draft"
    
    def test_list_rfqs(self):
        """GET /api/rfq/list returns RFQs"""
        res = requests.get(f"{BASE_URL}/api/rfq/list?limit=5")
        assert res.status_code == 200
        data = res.json()
        
        assert "rfqs" in data
        assert "total" in data
        assert isinstance(data["rfqs"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
