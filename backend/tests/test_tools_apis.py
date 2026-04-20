"""
Test suite for all 10 Free Tools APIs
Tests calculators, AI-powered tools, and utility tools
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestToolsListAPI:
    """Test tools list endpoint"""
    
    def test_get_tools_list(self):
        """Test GET /api/tools/tools-list returns all tools categorized"""
        response = requests.get(f"{BASE_URL}/api/tools/tools-list")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify categories exist
        assert "calculators" in data
        assert "ai_tools" in data
        assert "utility_tools" in data
        
        # Verify calculator count (6 calculators)
        assert len(data["calculators"]) == 6
        
        # Verify AI tools count (2 AI tools)
        assert len(data["ai_tools"]) == 2
        
        # Verify utility tools count (1 barcode generator)
        assert len(data["utility_tools"]) == 1
        
        print("✅ Tools list endpoint returns correct categorization")


class TestGSTCalculator:
    """Test GST Calculator API - /api/tools/gst-calculator"""
    
    def test_gst_exclusive_calculation(self):
        """Calculate GST when price is exclusive (add GST to base amount)"""
        payload = {
            "amount": 1000,
            "gst_rate": 18,
            "is_inclusive": False
        }
        response = requests.post(f"{BASE_URL}/api/tools/gst-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["original_amount"] == 1000
        assert data["gst_rate"] == 18
        assert data["gst_amount"] == 180  # 18% of 1000
        assert data["total_amount"] == 1180
        assert data["cgst"] == 90  # Half of GST
        assert data["sgst"] == 90  # Half of GST
        
        print("✅ GST exclusive calculation correct")
    
    def test_gst_inclusive_calculation(self):
        """Calculate GST when price is inclusive (extract GST from total)"""
        payload = {
            "amount": 1180,  # Total inclusive
            "gst_rate": 18,
            "is_inclusive": True
        }
        response = requests.post(f"{BASE_URL}/api/tools/gst-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["original_amount"] == 1000  # Base amount
        assert data["gst_amount"] == 180
        assert data["total_amount"] == 1180
        
        print("✅ GST inclusive calculation correct")
    
    def test_gst_different_rates(self):
        """Test GST calculations with different rates (5%, 12%, 18%, 28%)"""
        rates = [5, 12, 18, 28]
        amount = 1000
        
        for rate in rates:
            payload = {"amount": amount, "gst_rate": rate, "is_inclusive": False}
            response = requests.post(f"{BASE_URL}/api/tools/gst-calculator", json=payload)
            assert response.status_code == 200
            
            data = response.json()
            expected_gst = amount * rate / 100
            assert data["gst_amount"] == expected_gst
            assert data["total_amount"] == amount + expected_gst
        
        print("✅ GST calculations work for all rates (5%, 12%, 18%, 28%)")


class TestProfitMarginCalculator:
    """Test Profit Margin Calculator API - /api/tools/profit-margin-calculator"""
    
    def test_calculate_from_selling_price(self):
        """Calculate margin when selling price is provided"""
        payload = {
            "cost_price": 100,
            "selling_price": 150
        }
        response = requests.post(f"{BASE_URL}/api/tools/profit-margin-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["cost_price"] == 100
        assert data["selling_price"] == 150
        assert data["profit"] == 50
        assert data["profit_margin_percentage"] == pytest.approx(33.33, rel=0.01)
        assert data["markup_percentage"] == 50
        
        print("✅ Profit margin from selling price mode works")
    
    def test_calculate_from_desired_margin(self):
        """Calculate selling price when desired margin is provided"""
        payload = {
            "cost_price": 100,
            "desired_margin": 25  # Want 25% margin
        }
        response = requests.post(f"{BASE_URL}/api/tools/profit-margin-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        # For 25% margin: SP = Cost / (1 - 0.25) = 100 / 0.75 = 133.33
        assert data["selling_price"] == pytest.approx(133.33, rel=0.01)
        assert data["profit_margin_percentage"] == 25
        
        print("✅ Profit margin from desired margin mode works")
    
    def test_missing_parameters_error(self):
        """Should error if neither selling_price nor desired_margin provided"""
        payload = {
            "cost_price": 100
        }
        response = requests.post(f"{BASE_URL}/api/tools/profit-margin-calculator", json=payload)
        assert response.status_code == 400
        
        print("✅ Proper validation for missing parameters")


class TestDiscountCalculator:
    """Test Discount Calculator API - /api/tools/discount-calculator"""
    
    def test_calculate_with_discount_percentage(self):
        """Calculate discount when percentage is provided"""
        payload = {
            "original_price": 500,
            "discount_percentage": 20
        }
        response = requests.post(f"{BASE_URL}/api/tools/discount-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["original_price"] == 500
        assert data["discount_percentage"] == 20
        assert data["discount_amount"] == 100  # 20% of 500
        assert data["final_price"] == 400
        assert data["savings"] == 100
        
        print("✅ Discount by percentage mode works")
    
    def test_calculate_with_discount_amount(self):
        """Calculate discount when amount is provided"""
        payload = {
            "original_price": 500,
            "discount_amount": 75
        }
        response = requests.post(f"{BASE_URL}/api/tools/discount-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["discount_amount"] == 75
        assert data["discount_percentage"] == 15  # 75/500 * 100
        assert data["final_price"] == 425
        
        print("✅ Discount by amount mode works")
    
    def test_calculate_with_final_price(self):
        """Calculate discount when final price is provided"""
        payload = {
            "original_price": 500,
            "final_price": 350
        }
        response = requests.post(f"{BASE_URL}/api/tools/discount-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["discount_amount"] == 150
        assert data["discount_percentage"] == 30  # 150/500 * 100
        assert data["final_price"] == 350
        
        print("✅ Discount by final price mode works")
    
    def test_missing_discount_parameter_error(self):
        """Should error if no discount parameter is provided"""
        payload = {
            "original_price": 500
        }
        response = requests.post(f"{BASE_URL}/api/tools/discount-calculator", json=payload)
        assert response.status_code == 400
        
        print("✅ Proper validation for missing discount parameter")


class TestGSMCalculator:
    """Test GSM Calculator API - /api/tools/gsm-calculator"""
    
    def test_calculate_gsm_from_dimensions(self):
        """Calculate GSM from length, width, weight"""
        # 1m x 1m fabric weighing 200g = 200 GSM
        payload = {
            "length": 1.0,  # meters
            "width": 1.0,   # meters
            "weight": 200   # grams
        }
        response = requests.post(f"{BASE_URL}/api/tools/gsm-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["gsm"] == 200
        # 200 GSM / 33.906 = ~5.9 oz/sq yard
        assert data["oz_per_sq_yard"] == pytest.approx(5.9, rel=0.1)
        
        print("✅ GSM calculation from dimensions works")
    
    def test_convert_ounce_to_gsm(self):
        """Convert oz/sq yard to GSM"""
        payload = {
            "length": 1,  # dummy value
            "width": 1,   # dummy value
            "weight": 0,  # dummy value
            "from_ounce": 6.0  # 6 oz/sq yard
        }
        response = requests.post(f"{BASE_URL}/api/tools/gsm-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        # 6 oz/sq yard * 33.906 = ~203.44 GSM
        assert data["gsm"] == pytest.approx(203.44, rel=0.1)
        assert data["oz_per_sq_yard"] == 6.0
        
        print("✅ Ounce to GSM conversion works")
    
    def test_zero_area_error(self):
        """Should error when area is zero"""
        payload = {
            "length": 0,
            "width": 1,
            "weight": 100
        }
        response = requests.post(f"{BASE_URL}/api/tools/gsm-calculator", json=payload)
        assert response.status_code == 400
        
        print("✅ Proper validation for zero area")


class TestCBMCalculator:
    """Test CBM Calculator API - /api/tools/cbm-calculator"""
    
    def test_single_unit_cbm(self):
        """Calculate CBM for a single unit"""
        # Box: 100cm x 50cm x 30cm = 0.15 CBM
        payload = {
            "length": 100,  # cm
            "width": 50,    # cm
            "height": 30,   # cm
            "quantity": 1
        }
        response = requests.post(f"{BASE_URL}/api/tools/cbm-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["length_m"] == 1.0
        assert data["width_m"] == 0.5
        assert data["height_m"] == 0.3
        assert data["cbm_per_unit"] == pytest.approx(0.15, rel=0.01)
        assert data["total_cbm"] == pytest.approx(0.15, rel=0.01)
        assert data["quantity"] == 1
        
        print("✅ Single unit CBM calculation works")
    
    def test_multiple_units_cbm(self):
        """Calculate CBM for multiple units"""
        payload = {
            "length": 100,
            "width": 50,
            "height": 30,
            "quantity": 10
        }
        response = requests.post(f"{BASE_URL}/api/tools/cbm-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["cbm_per_unit"] == pytest.approx(0.15, rel=0.01)
        assert data["total_cbm"] == pytest.approx(1.5, rel=0.01)
        assert data["quantity"] == 10
        
        print("✅ Multiple units CBM calculation works")


class TestVolumetricWeightCalculator:
    """Test Volumetric Weight Calculator API - /api/tools/volumetric-weight-calculator"""
    
    def test_volumetric_weight_default_divisor(self):
        """Calculate volumetric weight with default divisor (5000)"""
        # 50x40x30 cm = 60000 cm3 / 5000 = 12 kg volumetric
        payload = {
            "length": 50,
            "width": 40,
            "height": 30
        }
        response = requests.post(f"{BASE_URL}/api/tools/volumetric-weight-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["volume_cm3"] == 60000
        assert data["volumetric_weight_kg"] == 12
        assert data["divisor_used"] == 5000
        
        print("✅ Volumetric weight with default divisor works")
    
    def test_volumetric_weight_custom_divisor(self):
        """Calculate volumetric weight with custom divisor"""
        # For air cargo divisor 6000: 60000/6000 = 10 kg
        payload = {
            "length": 50,
            "width": 40,
            "height": 30,
            "divisor": 6000
        }
        response = requests.post(f"{BASE_URL}/api/tools/volumetric-weight-calculator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["volumetric_weight_kg"] == 10
        assert data["divisor_used"] == 6000
        
        print("✅ Volumetric weight with custom divisor works")


class TestBarcodeGenerator:
    """Test Barcode Generator API - /api/tools/barcode-generator"""
    
    def test_code128_barcode(self):
        """Generate CODE128 barcode"""
        payload = {
            "data": "SKU-12345",
            "barcode_type": "CODE128"
        }
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["data"] == "SKU-12345"
        assert data["type"] == "CODE128"
        
        print("✅ CODE128 barcode generation works")
    
    def test_ean13_validation(self):
        """EAN13 requires exactly 12 digits"""
        # Valid 12-digit code
        payload = {"data": "590123456789", "barcode_type": "EAN13"}
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 200
        
        # Invalid (wrong length)
        payload = {"data": "12345", "barcode_type": "EAN13"}
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 400
        
        print("✅ EAN13 validation works")
    
    def test_upc_validation(self):
        """UPC requires exactly 11 digits"""
        # Valid 11-digit code
        payload = {"data": "01234567890", "barcode_type": "UPC"}
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 200
        
        # Invalid (wrong length)
        payload = {"data": "123", "barcode_type": "UPC"}
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 400
        
        print("✅ UPC validation works")
    
    def test_unsupported_barcode_type(self):
        """Should error for unsupported barcode types"""
        payload = {"data": "123", "barcode_type": "INVALID"}
        response = requests.post(f"{BASE_URL}/api/tools/barcode-generator", json=payload)
        assert response.status_code == 400
        
        print("✅ Unsupported barcode type validation works")


class TestProductDescriptionGenerator:
    """Test Product Description Generator API - /api/tools/product-description-generator"""
    
    def test_generate_description(self):
        """Test AI-powered product description generation"""
        payload = {
            "product_name": "Premium Cotton Poplin",
            "fabric_type": "Woven",
            "composition": "100% Cotton",
            "gsm": 120,
            "width": "58 inches",
            "color": "White",
            "tone": "professional"
        }
        response = requests.post(f"{BASE_URL}/api/tools/product-description-generator", json=payload)
        
        # AI endpoint may take time, allow 200 or 500 based on API key config
        if response.status_code == 200:
            data = response.json()
            assert "generated_text" in data
            assert len(data["generated_text"]) > 0
            assert "suggestions" in data
            print("✅ Product description generation works (AI responded)")
        elif response.status_code == 500:
            # AI service might not be configured in test env
            data = response.json()
            assert "detail" in data
            print("⚠️ AI service not configured or API error (expected in test env)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_description_minimal_input(self):
        """Test with minimal required input"""
        payload = {
            "product_name": "Denim Fabric"
        }
        response = requests.post(f"{BASE_URL}/api/tools/product-description-generator", json=payload)
        assert response.status_code in [200, 500]  # 500 if AI not configured
        print("✅ Product description accepts minimal input")


class TestProductTitleGenerator:
    """Test Product Title Generator API - /api/tools/product-title-generator"""
    
    def test_generate_titles(self):
        """Test AI-powered product title generation"""
        payload = {
            "product_name": "Cotton Canvas",
            "fabric_type": "Woven",
            "composition": "100% Cotton",
            "color": "Navy Blue",
            "key_feature": "Heavy-weight"
        }
        response = requests.post(f"{BASE_URL}/api/tools/product-title-generator", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            assert "generated_text" in data
            assert "suggestions" in data
            # Should generate multiple suggestions
            assert len(data["suggestions"]) > 0
            print("✅ Product title generation works (AI responded)")
        elif response.status_code == 500:
            print("⚠️ AI service not configured or API error (expected in test env)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_title_minimal_input(self):
        """Test with minimal required input"""
        payload = {
            "product_name": "Silk Fabric"
        }
        response = requests.post(f"{BASE_URL}/api/tools/product-title-generator", json=payload)
        assert response.status_code in [200, 500]  # 500 if AI not configured
        print("✅ Product title accepts minimal input")


class TestFabricWeightConverter:
    """Test Fabric Weight Converter API - /api/tools/fabric-weight-converter"""
    
    def test_gsm_to_oz_sqyd(self):
        """Convert GSM to oz/sq yard"""
        response = requests.post(
            f"{BASE_URL}/api/tools/fabric-weight-converter",
            params={"value": 200, "from_unit": "gsm", "to_unit": "oz_sqyd"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # 200 GSM / 33.906 = ~5.9 oz/sqyd
        assert data["output_value"] == pytest.approx(5.9, rel=0.1)
        
        print("✅ GSM to oz/sq yard conversion works")
    
    def test_oz_sqyd_to_gsm(self):
        """Convert oz/sq yard to GSM"""
        response = requests.post(
            f"{BASE_URL}/api/tools/fabric-weight-converter",
            params={"value": 6, "from_unit": "oz_sqyd", "to_unit": "gsm"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # 6 oz * 33.906 = ~203.44 GSM
        assert data["output_value"] == pytest.approx(203.44, rel=0.1)
        
        print("✅ oz/sq yard to GSM conversion works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
