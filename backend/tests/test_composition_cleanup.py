"""
Test suite for Composition Cleanup Feature
Tests:
- GET /api/composition/options returns 20 canonical materials
- GET /api/fabrics/filter-options returns only canonical compositions
- POST /api/migrate/compositions (dry-run and apply)
- Composition normalization on fabric create/update (admin and vendor)
- composition_utils.py unit tests for normalize_material and canonicalize_composition
"""
import pytest
import requests
import os
import sys

# Add backend to path for importing composition_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Expected canonical compositions (20 items in order)
CANONICAL_COMPOSITIONS = [
    "Cotton", "Organic Cotton", "Recycled Cotton", "Polyester", "Recycled Polyester",
    "Viscose", "Lyocell", "Modal", "Lycra", "Linen", "Hemp", "Nylon", "Wool", "Silk",
    "Bamboo", "Acrylic", "Cashmere", "Lurex", "Jute", "Rayon"
]

# Known typos that should NOT appear in filter-options
KNOWN_TYPOS = ['Cottton', 'Poly', 'Coitton', 'Lyvra', 'POlyester', 'viscose', 'Lyocel', 'ORG COTTON']


class TestCompositionOptions:
    """Test GET /api/composition/options endpoint"""
    
    def test_composition_options_returns_20_canonical_materials(self):
        """GET /api/composition/options returns exactly 20 canonical materials"""
        response = requests.get(f"{BASE_URL}/api/composition/options")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "options" in data, "Response should have 'options' key"
        
        options = data["options"]
        assert len(options) == 20, f"Expected 20 options, got {len(options)}"
        
        # Verify exact order matches CANONICAL_COMPOSITIONS
        assert options == CANONICAL_COMPOSITIONS, f"Options don't match expected canonical list"
        print(f"✓ GET /api/composition/options returns exactly 20 canonical materials in correct order")


class TestFilterOptions:
    """Test GET /api/fabrics/filter-options endpoint"""
    
    def test_filter_options_compositions_are_canonical(self):
        """GET /api/fabrics/filter-options compositions array contains ONLY canonical names"""
        response = requests.get(f"{BASE_URL}/api/fabrics/filter-options")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "compositions" in data, "Response should have 'compositions' key"
        
        compositions = data["compositions"]
        canonical_set = set(CANONICAL_COMPOSITIONS)
        
        # Check all returned compositions are in canonical list
        for comp in compositions:
            assert comp in canonical_set, f"'{comp}' is not in canonical list"
        
        # Check no typos are present
        for typo in KNOWN_TYPOS:
            assert typo not in compositions, f"Typo '{typo}' found in filter-options compositions"
        
        print(f"✓ GET /api/fabrics/filter-options returns {len(compositions)} canonical compositions")
        print(f"  Compositions: {sorted(compositions)}")


class TestMigrationEndpoint:
    """Test POST /api/migrate/compositions endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed - skipping migration tests")
        return response.json().get("token")
    
    def test_migration_requires_admin_auth(self):
        """POST /api/migrate/compositions without admin token returns 401/403"""
        response = requests.post(f"{BASE_URL}/api/migrate/compositions")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ POST /api/migrate/compositions requires admin authentication")
    
    def test_migration_dry_run_returns_zero_changes(self, admin_token):
        """POST /api/migrate/compositions (dry-run) returns changes_count=0 after migration applied"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/migrate/compositions", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total_fabrics" in data, "Response should have 'total_fabrics'"
        assert "unchanged" in data, "Response should have 'unchanged'"
        assert "changes_count" in data, "Response should have 'changes_count'"
        assert "applied" in data, "Response should have 'applied'"
        
        # After migration was applied, dry-run should return 0 changes (idempotent)
        assert data["changes_count"] == 0, f"Expected 0 changes (migration already applied), got {data['changes_count']}"
        assert data["applied"] == False, "Dry-run should have applied=False"
        
        print(f"✓ POST /api/migrate/compositions (dry-run) returns changes_count=0 (idempotent)")
        print(f"  Total fabrics: {data['total_fabrics']}, Unchanged: {data['unchanged']}")
    
    def test_migration_apply_is_idempotent(self, admin_token):
        """POST /api/migrate/compositions?apply=true is idempotent (0 changes after first apply)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First, check dry-run
        dry_run = requests.post(f"{BASE_URL}/api/migrate/compositions", headers=headers)
        assert dry_run.status_code == 200
        
        if dry_run.json()["changes_count"] == 0:
            # Migration already applied, verify apply=true also returns 0
            response = requests.post(f"{BASE_URL}/api/migrate/compositions?apply=true", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert data["changes_count"] == 0, "Apply should also return 0 changes when already migrated"
            print("✓ POST /api/migrate/compositions?apply=true is idempotent (0 changes)")
        else:
            print(f"⚠ Migration has {dry_run.json()['changes_count']} pending changes - skipping apply test")


class TestAdminFabricNormalization:
    """Test composition normalization on admin fabric create/update"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("token")
    
    @pytest.fixture
    def test_category_id(self):
        """Get a valid category ID for testing"""
        response = requests.get(f"{BASE_URL}/api/categories")
        if response.status_code != 200 or not response.json():
            pytest.skip("No categories available")
        return response.json()[0]["id"]
    
    def test_admin_create_fabric_normalizes_composition(self, admin_token, test_category_id):
        """POST /api/fabrics (admin create) with typo composition gets auto-normalized"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create fabric with typos: 'Poly' and 'Cottton'
        payload = {
            "name": "TEST_Normalization_Fabric",
            "category_id": test_category_id,
            "fabric_type": "woven",
            "width": "58",
            "moq": "100",
            "color": "White",
            "description": "Test fabric for composition normalization",
            "composition": [
                {"material": "Cottton", "percentage": 70},  # Typo
                {"material": "Poly", "percentage": 28},      # Alias
                {"material": "Spandex", "percentage": 2}     # Synonym for Lycra
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/fabrics", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        fabric_id = data.get("id")
        
        # Verify composition was normalized
        composition = data.get("composition", [])
        materials = [c["material"] for c in composition]
        
        assert "Cotton" in materials, "Cottton should be normalized to Cotton"
        assert "Polyester" in materials, "Poly should be normalized to Polyester"
        assert "Lycra" in materials, "Spandex should be normalized to Lycra"
        assert "Cottton" not in materials, "Typo 'Cottton' should not appear"
        assert "Poly" not in materials, "Alias 'Poly' should not appear"
        assert "Spandex" not in materials, "Synonym 'Spandex' should not appear"
        
        print(f"✓ POST /api/fabrics normalizes composition: {materials}")
        
        # Cleanup: delete test fabric
        if fabric_id:
            requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=headers)
    
    def test_admin_update_fabric_normalizes_composition(self, admin_token, test_category_id):
        """PUT /api/fabrics/{id} (admin update) with typo composition gets normalized"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create a fabric
        create_payload = {
            "name": "TEST_Update_Normalization",
            "category_id": test_category_id,
            "fabric_type": "woven",
            "width": "58",
            "moq": "100",
            "color": "White",
            "description": "Test fabric for update normalization",
            "composition": [{"material": "Cotton", "percentage": 100}]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/fabrics", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json().get("id")
        
        # Update with typos
        update_payload = {
            "composition": [
                {"material": "POlyester", "percentage": 60},  # Casing typo
                {"material": "Elastane", "percentage": 5},     # Synonym for Lycra
                {"material": "viscose", "percentage": 35}      # Lowercase
            ]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/fabrics/{fabric_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        data = update_response.json()
        composition = data.get("composition", [])
        materials = [c["material"] for c in composition]
        
        assert "Polyester" in materials, "POlyester should be normalized to Polyester"
        assert "Lycra" in materials, "Elastane should be normalized to Lycra"
        assert "Viscose" in materials, "viscose should be normalized to Viscose"
        
        print(f"✓ PUT /api/fabrics/{fabric_id} normalizes composition: {materials}")
        
        # Cleanup
        if fabric_id:
            requests.delete(f"{BASE_URL}/api/fabrics/{fabric_id}", headers=headers)


class TestVendorFabricNormalization:
    """Test composition normalization on vendor fabric create/update"""
    
    @pytest.fixture
    def vendor_token(self):
        """Get vendor authentication token"""
        response = requests.post(f"{BASE_URL}/api/vendor/login", json={
            "email": "vendor@test.com",
            "password": "vendor123"
        })
        if response.status_code != 200:
            pytest.skip("Vendor login failed")
        return response.json().get("token")
    
    @pytest.fixture
    def test_category_id(self):
        """Get a valid category ID for testing"""
        response = requests.get(f"{BASE_URL}/api/categories")
        if response.status_code != 200 or not response.json():
            pytest.skip("No categories available")
        return response.json()[0]["id"]
    
    def test_vendor_create_fabric_normalizes_composition(self, vendor_token, test_category_id):
        """POST /api/vendor/fabrics (vendor create) with typo composition gets normalized"""
        headers = {"Authorization": f"Bearer {vendor_token}"}
        
        # Create fabric with typos
        payload = {
            "name": "TEST_Vendor_Normalization",
            "category_id": test_category_id,
            "fabric_type": "woven",
            "gsm": 200,
            "width": "58",
            "moq": "100",
            "description": "Test vendor fabric",
            "composition": [
                {"material": "Lyvra", "percentage": 5},       # Typo for Lycra
                {"material": "Tencel", "percentage": 45},     # Synonym for Lyocell
                {"material": "Cotton", "percentage": 50}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        fabric_id = data.get("id")
        
        composition = data.get("composition", [])
        materials = [c["material"] for c in composition]
        
        assert "Lycra" in materials, "Lyvra should be normalized to Lycra"
        assert "Lyocell" in materials, "Tencel should be normalized to Lyocell"
        assert "Cotton" in materials, "Cotton should remain Cotton"
        assert "Lyvra" not in materials, "Typo 'Lyvra' should not appear"
        assert "Tencel" not in materials, "Synonym 'Tencel' should not appear"
        
        print(f"✓ POST /api/vendor/fabrics normalizes composition: {materials}")
        
        # Cleanup
        if fabric_id:
            requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=headers)
    
    def test_vendor_update_fabric_normalizes_composition(self, vendor_token, test_category_id):
        """PUT /api/vendor/fabrics/{id} (vendor update) normalizes composition"""
        headers = {"Authorization": f"Bearer {vendor_token}"}
        
        # First create a fabric
        create_payload = {
            "name": "TEST_Vendor_Update_Norm",
            "category_id": test_category_id,
            "fabric_type": "woven",
            "gsm": 200,
            "width": "58",
            "moq": "100",
            "description": "Test vendor fabric for update",
            "composition": [{"material": "Cotton", "percentage": 100}]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/vendor/fabrics", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        fabric_id = create_response.json().get("id")
        
        # Update with typos
        update_payload = {
            "composition": [
                {"material": "RPET", "percentage": 60},        # Alias for Recycled Polyester
                {"material": "Flex", "percentage": 5},          # Alias for Lycra
                {"material": "org cotton", "percentage": 35}    # Alias for Organic Cotton
            ]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        
        data = update_response.json()
        composition = data.get("composition", [])
        materials = [c["material"] for c in composition]
        
        assert "Recycled Polyester" in materials, "RPET should be normalized to Recycled Polyester"
        assert "Lycra" in materials, "Flex should be normalized to Lycra"
        assert "Organic Cotton" in materials, "org cotton should be normalized to Organic Cotton"
        
        print(f"✓ PUT /api/vendor/fabrics/{fabric_id} normalizes composition: {materials}")
        
        # Cleanup
        if fabric_id:
            requests.delete(f"{BASE_URL}/api/vendor/fabrics/{fabric_id}", headers=headers)


class TestCompositionUtilsUnit:
    """Unit tests for composition_utils.py functions"""
    
    def test_normalize_material_typos(self):
        """normalize_material() handles common typos"""
        from composition_utils import normalize_material
        
        test_cases = [
            ("Cottton", "Cotton"),
            ("Poly", "Polyester"),
            ("POlyester", "Polyester"),
            ("Lyvra", "Lycra"),
            ("Spandex", "Lycra"),
            ("Elastane", "Lycra"),
            ("Flex", "Lycra"),
            ("viscose", "Viscose"),
            ("Lyocel", "Lyocell"),
            ("Tencel", "Lyocell"),
            ("ORG COTTON", "Organic Cotton"),
            ("org cotton", "Organic Cotton"),
            ("RPET", "Recycled Polyester"),
            ("r-pet", "Recycled Polyester"),
        ]
        
        for raw, expected in test_cases:
            result = normalize_material(raw)
            assert result == expected, f"normalize_material('{raw}') = '{result}', expected '{expected}'"
            print(f"  ✓ '{raw}' → '{result}'")
        
        print("✓ normalize_material() handles all typos correctly")
    
    def test_normalize_material_unknown_fallback(self):
        """normalize_material() falls back to title case for unknown strings"""
        from composition_utils import normalize_material
        
        result = normalize_material("foobar fibre")
        assert result == "Foobar Fibre", f"Expected 'Foobar Fibre', got '{result}'"
        
        result = normalize_material("UNKNOWN MATERIAL")
        assert result == "Unknown Material", f"Expected 'Unknown Material', got '{result}'"
        
        print("✓ normalize_material() falls back to title case for unknown strings")
    
    def test_canonicalize_composition_merges_duplicates(self):
        """canonicalize_composition() merges duplicates that collapse to same canonical name"""
        from composition_utils import canonicalize_composition
        
        # Input with duplicates: Cotton + Cottton should merge
        input_comp = [
            {"material": "Cotton", "percentage": 50},
            {"material": "Cottton", "percentage": 30}  # Typo
        ]
        
        result = canonicalize_composition(input_comp)
        
        # Should have only one Cotton entry with 80%
        assert len(result) == 1, f"Expected 1 entry, got {len(result)}"
        assert result[0]["material"] == "Cotton"
        assert result[0]["percentage"] == 80, f"Expected 80%, got {result[0]['percentage']}%"
        
        print("✓ canonicalize_composition() merges duplicates correctly")
    
    def test_canonicalize_composition_preserves_integer_percentages(self):
        """canonicalize_composition() preserves integer percentages as int"""
        from composition_utils import canonicalize_composition
        
        input_comp = [
            {"material": "Cotton", "percentage": 78},
            {"material": "Polyester", "percentage": 20},
            {"material": "Lycra", "percentage": 2}
        ]
        
        result = canonicalize_composition(input_comp)
        
        for item in result:
            assert isinstance(item["percentage"], int), f"Expected int, got {type(item['percentage'])}"
        
        print("✓ canonicalize_composition() preserves integer percentages as int")
    
    def test_canonicalize_composition_preserves_half_step_floats(self):
        """canonicalize_composition() preserves half-step floats like 2.5%"""
        from composition_utils import canonicalize_composition
        
        input_comp = [
            {"material": "Cotton", "percentage": 97.5},
            {"material": "Lycra", "percentage": 2.5}
        ]
        
        result = canonicalize_composition(input_comp)
        
        lycra_entry = next((c for c in result if c["material"] == "Lycra"), None)
        assert lycra_entry is not None
        assert lycra_entry["percentage"] == 2.5, f"Expected 2.5, got {lycra_entry['percentage']}"
        
        print("✓ canonicalize_composition() preserves half-step floats")
    
    def test_canonicalize_composition_parses_legacy_string(self):
        """canonicalize_composition() accepts legacy string format"""
        from composition_utils import canonicalize_composition
        
        legacy_string = "Cotton 78%, Poly 20%, Spandex 2%"
        result = canonicalize_composition(legacy_string)
        
        # Should parse and normalize
        materials = {c["material"]: c["percentage"] for c in result}
        
        assert "Cotton" in materials, "Should have Cotton"
        assert materials["Cotton"] == 78, f"Cotton should be 78%, got {materials.get('Cotton')}"
        
        assert "Polyester" in materials, "Poly should be normalized to Polyester"
        assert materials["Polyester"] == 20, f"Polyester should be 20%, got {materials.get('Polyester')}"
        
        assert "Lycra" in materials, "Spandex should be normalized to Lycra"
        assert materials["Lycra"] == 2, f"Lycra should be 2%, got {materials.get('Lycra')}"
        
        print("✓ canonicalize_composition() parses legacy string format")
    
    def test_canonicalize_composition_sorts_by_percentage_desc(self):
        """canonicalize_composition() sorts output by percentage descending"""
        from composition_utils import canonicalize_composition
        
        input_comp = [
            {"material": "Lycra", "percentage": 2},
            {"material": "Cotton", "percentage": 78},
            {"material": "Polyester", "percentage": 20}
        ]
        
        result = canonicalize_composition(input_comp)
        
        # Should be sorted: Cotton (78), Polyester (20), Lycra (2)
        assert result[0]["material"] == "Cotton", f"First should be Cotton, got {result[0]['material']}"
        assert result[1]["material"] == "Polyester", f"Second should be Polyester, got {result[1]['material']}"
        assert result[2]["material"] == "Lycra", f"Third should be Lycra, got {result[2]['material']}"
        
        print("✓ canonicalize_composition() sorts by percentage descending")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
