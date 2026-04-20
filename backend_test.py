#!/usr/bin/env python3
import requests
import sys
import json
from datetime import datetime

class FabricCMSAPITester:
    def __init__(self, base_url="https://fabric-sourcing-cms.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.headers = {'Content-Type': 'application/json'}
        
    def run_test(self, name, method, endpoint, expected_status, data=None, auth=False):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = self.headers.copy()
        if auth and self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            print(f"   Status: {response.status_code}")
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Expected {expected_status}, got {response.status_code}")
                try:
                    response_data = response.json()
                    return True, response_data
                except:
                    return True, {}
            else:
                self.failed_tests.append({
                    'test': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'response': response.text[:200] if response.text else ''
                })
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False, {}
                
        except Exception as e:
            self.failed_tests.append({
                'test': name,
                'error': str(e)
            })
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n" + "="*50)
        print("TESTING AUTHENTICATION ENDPOINTS")
        print("="*50)
        
        # Test admin login with correct credentials
        success, response = self.run_test(
            "Admin Login (Valid Credentials)",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@locofast.com", "password": "admin123"}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token received: {self.token[:20]}...")
        
        # Test invalid credentials
        self.run_test(
            "Admin Login (Invalid Credentials)",
            "POST", 
            "auth/login",
            401,
            data={"email": "wrong@test.com", "password": "wrong"}
        )
        
        # Test get current admin (with token)
        if self.token:
            self.run_test(
                "Get Current Admin",
                "GET",
                "auth/me",
                200,
                auth=True
            )

    def test_category_endpoints(self):
        """Test category CRUD operations"""
        print("\n" + "="*50)
        print("TESTING CATEGORY ENDPOINTS")
        print("="*50)
        
        # Get all categories
        success, categories = self.run_test(
            "Get All Categories",
            "GET",
            "categories",
            200
        )
        
        if success and len(categories) > 0:
            category_id = categories[0]['id']
            
            # Get single category
            self.run_test(
                "Get Single Category",
                "GET",
                f"categories/{category_id}",
                200
            )
            
            # Test with authenticated endpoints
            if self.token:
                # Create new category
                new_category_success, new_category = self.run_test(
                    "Create Category",
                    "POST",
                    "categories",
                    200,
                    data={
                        "name": "Test Category",
                        "description": "Test description",
                        "image_url": "https://example.com/test.jpg"
                    },
                    auth=True
                )
                
                if new_category_success and 'id' in new_category:
                    test_cat_id = new_category['id']
                    
                    # Update category
                    self.run_test(
                        "Update Category",
                        "PUT",
                        f"categories/{test_cat_id}",
                        200,
                        data={"name": "Updated Test Category"},
                        auth=True
                    )
                    
                    # Delete category
                    self.run_test(
                        "Delete Category",
                        "DELETE",
                        f"categories/{test_cat_id}",
                        200,
                        auth=True
                    )

    def test_fabric_endpoints(self):
        """Test fabric CRUD operations"""
        print("\n" + "="*50) 
        print("TESTING FABRIC ENDPOINTS")
        print("="*50)
        
        # Get all fabrics
        success, fabrics = self.run_test(
            "Get All Fabrics",
            "GET",
            "fabrics",
            200
        )
        
        if success and len(fabrics) > 0:
            fabric_id = fabrics[0]['id']
            
            # Get single fabric
            self.run_test(
                "Get Single Fabric",
                "GET",
                f"fabrics/{fabric_id}",
                200
            )
            
            # Test search and filters
            self.run_test(
                "Search Fabrics",
                "GET",
                "fabrics?search=cotton",
                200
            )
            
            self.run_test(
                "Filter by GSM range",
                "GET",
                "fabrics?min_gsm=100&max_gsm=200",
                200
            )

    def test_enquiry_endpoints(self):
        """Test enquiry endpoints"""
        print("\n" + "="*50)
        print("TESTING ENQUIRY ENDPOINTS") 
        print("="*50)
        
        # Create enquiry (public endpoint)
        success, enquiry = self.run_test(
            "Create Enquiry",
            "POST",
            "enquiries",
            200,
            data={
                "name": "Test Customer",
                "email": "test@example.com",
                "phone": "+1234567890",
                "company": "Test Company",
                "message": "Test enquiry message",
                "fabric_name": "Test Fabric"
            }
        )
        
        if self.token:
            # Get enquiries (admin only)
            self.run_test(
                "Get All Enquiries",
                "GET",
                "enquiries",
                200,
                auth=True
            )
            
            if success and 'id' in enquiry:
                enquiry_id = enquiry['id']
                # Update enquiry status
                self.run_test(
                    "Update Enquiry Status",
                    "PUT",
                    f"enquiries/{enquiry_id}/status?status=contacted",
                    200,
                    auth=True
                )

    def test_stats_endpoint(self):
        """Test stats endpoint"""
        print("\n" + "="*50)
        print("TESTING STATS ENDPOINT")
        print("="*50)
        
        if self.token:
            self.run_test(
                "Get Admin Stats",
                "GET",
                "stats",
                200,
                auth=True
            )

    def test_seed_endpoint(self):
        """Test seed endpoint"""
        print("\n" + "="*50)
        print("TESTING SEED ENDPOINT")
        print("="*50)
        
        # Seed should return message that data already exists
        self.run_test(
            "Seed Data",
            "POST",
            "seed",
            200
        )

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {len(self.failed_tests)}")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failed_tests, 1):
                print(f"{i}. {failure['test']}")
                if 'expected' in failure:
                    print(f"   Expected: {failure['expected']}, Got: {failure['actual']}")
                    if failure['response']:
                        print(f"   Response: {failure['response']}")
                if 'error' in failure:
                    print(f"   Error: {failure['error']}")
        
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"\n📊 Success rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    print("🚀 Starting Locofast CMS API Tests")
    print(f"Backend URL: https://fabric-sourcing-cms.preview.emergentagent.com")
    
    tester = FabricCMSAPITester()
    
    # Run all tests
    tester.test_seed_endpoint()
    tester.test_auth_endpoints() 
    tester.test_category_endpoints()
    tester.test_fabric_endpoints()
    tester.test_enquiry_endpoints()
    tester.test_stats_endpoint()
    
    # Print summary
    success = tester.print_summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())