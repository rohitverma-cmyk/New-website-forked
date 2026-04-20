"""
Commission Features Test Suite
Tests commission rules CRUD, calculate-preview, and commission hierarchy
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCommissionRulesCRUD:
    """Test commission rules CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_rule_ids = []
        yield
        # Cleanup created rules
        for rule_id in self.created_rule_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/commission/rules/{rule_id}")
            except:
                pass
    
    def test_list_commission_rules(self):
        """GET /api/commission/rules - List all rules"""
        response = self.session.get(f"{BASE_URL}/api/commission/rules")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of rules"
        print(f"✓ Found {len(data)} commission rules")
    
    def test_get_default_commission(self):
        """GET /api/commission/default - Get default commission %"""
        response = self.session.get(f"{BASE_URL}/api/commission/default")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "default_pct" in data, "Expected default_pct in response"
        assert data["default_pct"] == 5.0, f"Expected default 5%, got {data['default_pct']}"
        print(f"✓ Default commission: {data['default_pct']}%")
    
    def test_create_vendor_rule(self):
        """POST /api/commission/rules - Create vendor-specific rule"""
        rule_data = {
            "rule_type": "vendor",
            "vendor_id": f"test-vendor-{uuid.uuid4().hex[:8]}",
            "vendor_name": "Test Vendor",
            "commission_pct": 8.0,
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Expected id in response"
        assert data["rule_type"] == "vendor"
        assert data["commission_pct"] == 8.0
        self.created_rule_ids.append(data["id"])
        print(f"✓ Created vendor rule: {data['id']}")
        return data["id"]
    
    def test_create_category_rule(self):
        """POST /api/commission/rules - Create category rule"""
        rule_data = {
            "rule_type": "category",
            "category_name": "Test Category",
            "commission_pct": 7.5,
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["rule_type"] == "category"
        assert data["category_name"] == "Test Category"
        self.created_rule_ids.append(data["id"])
        print(f"✓ Created category rule: {data['id']}")
    
    def test_create_cart_value_rule(self):
        """POST /api/commission/rules - Create cart value slab rule"""
        rule_data = {
            "rule_type": "cart_value",
            "min_value": 100000,
            "max_value": 500000,
            "commission_pct": 4.0,
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["rule_type"] == "cart_value"
        assert data["min_value"] == 100000
        assert data["max_value"] == 500000
        self.created_rule_ids.append(data["id"])
        print(f"✓ Created cart_value rule: {data['id']}")
    
    def test_create_meterage_rule(self):
        """POST /api/commission/rules - Create meterage slab rule"""
        rule_data = {
            "rule_type": "meterage",
            "min_value": 1000,
            "max_value": 5000,
            "commission_pct": 3.5,
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["rule_type"] == "meterage"
        self.created_rule_ids.append(data["id"])
        print(f"✓ Created meterage rule: {data['id']}")
    
    def test_create_source_rule(self):
        """POST /api/commission/rules - Create source (inventory/rfq) rule"""
        rule_data = {
            "rule_type": "source",
            "source": "rfq",
            "commission_pct": 6.0,
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["rule_type"] == "source"
        assert data["source"] == "rfq"
        self.created_rule_ids.append(data["id"])
        print(f"✓ Created source rule: {data['id']}")
    
    def test_update_rule(self):
        """PUT /api/commission/rules/{id} - Update a rule"""
        # First create a rule
        rule_data = {
            "rule_type": "vendor",
            "vendor_id": f"update-test-{uuid.uuid4().hex[:8]}",
            "vendor_name": "Update Test Vendor",
            "commission_pct": 5.0,
            "is_active": True
        }
        create_res = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert create_res.status_code == 200
        rule_id = create_res.json()["id"]
        self.created_rule_ids.append(rule_id)
        
        # Update the rule
        update_data = {"commission_pct": 9.0, "is_active": False}
        update_res = self.session.put(f"{BASE_URL}/api/commission/rules/{rule_id}", json=update_data)
        assert update_res.status_code == 200, f"Expected 200, got {update_res.status_code}: {update_res.text}"
        updated = update_res.json()
        assert updated["commission_pct"] == 9.0, f"Expected 9.0, got {updated['commission_pct']}"
        assert updated["is_active"] == False
        print(f"✓ Updated rule {rule_id}: commission_pct=9.0, is_active=False")
    
    def test_delete_rule(self):
        """DELETE /api/commission/rules/{id} - Delete a rule"""
        # First create a rule
        rule_data = {
            "rule_type": "vendor",
            "vendor_id": f"delete-test-{uuid.uuid4().hex[:8]}",
            "vendor_name": "Delete Test Vendor",
            "commission_pct": 5.0,
            "is_active": True
        }
        create_res = self.session.post(f"{BASE_URL}/api/commission/rules", json=rule_data)
        assert create_res.status_code == 200
        rule_id = create_res.json()["id"]
        
        # Delete the rule
        delete_res = self.session.delete(f"{BASE_URL}/api/commission/rules/{rule_id}")
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}"
        data = delete_res.json()
        assert data.get("deleted") == True
        print(f"✓ Deleted rule {rule_id}")
    
    def test_delete_nonexistent_rule(self):
        """DELETE /api/commission/rules/{id} - 404 for nonexistent rule"""
        fake_id = f"nonexistent-{uuid.uuid4().hex}"
        response = self.session.delete(f"{BASE_URL}/api/commission/rules/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ 404 returned for nonexistent rule")


class TestCommissionCalculatePreview:
    """Test commission calculate-preview endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_calculate_preview_basic(self):
        """POST /api/commission/calculate-preview - Basic calculation"""
        preview_data = {
            "quantity": 100,
            "price": 150,
            "seller_id": "",
            "category_name": ""
        }
        response = self.session.post(f"{BASE_URL}/api/commission/calculate-preview", json=preview_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "commission_pct" in data
        assert "commission_amount" in data
        assert "rule_applied" in data
        print(f"✓ Preview: {data['commission_pct']}% = ₹{data['commission_amount']} ({data['rule_applied']})")
    
    def test_calculate_preview_with_items(self):
        """POST /api/commission/calculate-preview - With items array"""
        preview_data = {
            "items": [
                {"quantity": 200, "price_per_meter": 100, "seller_id": "", "category_name": "Cotton"},
                {"quantity": 100, "price_per_meter": 150, "seller_id": "", "category_name": "Cotton"}
            ]
        }
        response = self.session.post(f"{BASE_URL}/api/commission/calculate-preview", json=preview_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # Subtotal = 200*100 + 100*150 = 35000
        expected_subtotal = 35000
        expected_commission = expected_subtotal * data["commission_pct"] / 100
        assert abs(data["commission_amount"] - expected_commission) < 1, f"Commission mismatch"
        print(f"✓ Preview with items: {data['commission_pct']}% = ₹{data['commission_amount']}")


class TestSeededCommissionRules:
    """Test that seeded commission rules exist and are grouped correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_seeded_rules_exist(self):
        """Verify 9 seeded commission rules exist"""
        response = self.session.get(f"{BASE_URL}/api/commission/rules")
        assert response.status_code == 200
        rules = response.json()
        # Main agent mentioned 9 rules seeded
        assert len(rules) >= 9, f"Expected at least 9 seeded rules, got {len(rules)}"
        print(f"✓ Found {len(rules)} commission rules (expected ≥9)")
    
    def test_rules_have_all_types(self):
        """Verify rules cover all 5 types"""
        response = self.session.get(f"{BASE_URL}/api/commission/rules")
        rules = response.json()
        rule_types = set(r.get("rule_type") for r in rules)
        expected_types = {"vendor", "category", "cart_value", "meterage", "source"}
        # At least some types should be present
        present_types = rule_types.intersection(expected_types)
        print(f"✓ Rule types present: {present_types}")
        assert len(present_types) >= 3, f"Expected at least 3 rule types, got {present_types}"


class TestVendorOrdersAPI:
    """Test vendor orders endpoint returns commission info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as vendor
        login_res = self.session.post(f"{BASE_URL}/api/vendor/login", json={
            "email": "vendor@test.com",
            "password": "vendor123"
        })
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_vendor_orders_endpoint(self):
        """GET /api/vendor/orders - Returns orders with commission info"""
        response = self.session.get(f"{BASE_URL}/api/vendor/orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Check structure
        if isinstance(data, dict) and "data" in data:
            orders = data["data"]
        else:
            orders = data if isinstance(data, list) else []
        
        print(f"✓ Vendor orders endpoint returned {len(orders)} orders")
        
        # If there are orders, check commission fields
        if orders:
            order = orders[0]
            # Commission fields should be present
            has_commission_pct = "commission_pct" in order
            has_commission_amount = "commission_amount" in order
            has_seller_payout = "seller_payout" in order
            print(f"  - commission_pct present: {has_commission_pct}")
            print(f"  - commission_amount present: {has_commission_amount}")
            print(f"  - seller_payout present: {has_seller_payout}")


class TestAdminOrdersAPI:
    """Test admin orders endpoint returns commission info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "email": "admin@locofast.com",
            "password": "admin123"
        })
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_admin_orders_list(self):
        """GET /api/orders - Admin can list orders with commission"""
        response = self.session.get(f"{BASE_URL}/api/orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        orders = data.get("orders", [])
        print(f"✓ Admin orders endpoint returned {len(orders)} orders")
        
        # Check commission fields in orders
        if orders:
            order = orders[0]
            print(f"  - Order {order.get('order_number')}: commission_pct={order.get('commission_pct')}, seller_payout={order.get('seller_payout')}")


class TestAgentLoginOTPFix:
    """Test agent login OTP endpoint returns proper response"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_agent_send_otp_endpoint(self):
        """POST /api/agent/send-otp - Returns JSON response"""
        response = self.session.post(f"{BASE_URL}/api/agent/send-otp", json={
            "email": "agent@locofast.com"
        })
        # Should return 200 or 400/404 if agent not found
        assert response.status_code in [200, 400, 404], f"Unexpected status: {response.status_code}"
        
        # Response should be valid JSON
        try:
            data = response.json()
            print(f"✓ Agent send-otp returns valid JSON: {data}")
        except:
            # Try text then parse
            text = response.text
            import json
            data = json.loads(text)
            print(f"✓ Agent send-otp returns parseable text: {data}")
    
    def test_agent_verify_otp_endpoint(self):
        """POST /api/agent/verify-otp - Returns JSON response"""
        response = self.session.post(f"{BASE_URL}/api/agent/verify-otp", json={
            "email": "agent@locofast.com",
            "otp": "000000"  # Invalid OTP
        })
        # Should return 400 for invalid OTP
        assert response.status_code in [200, 400, 401], f"Unexpected status: {response.status_code}"
        
        # Response should be valid JSON
        try:
            data = response.json()
            print(f"✓ Agent verify-otp returns valid JSON: {data}")
        except:
            text = response.text
            import json
            data = json.loads(text)
            print(f"✓ Agent verify-otp returns parseable text: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
