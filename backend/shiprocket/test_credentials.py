"""
Shiprocket Credential Test Script
Run this to verify your Shiprocket API credentials
"""
import asyncio
import httpx
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_credentials():
    """Test Shiprocket API credentials"""
    email = os.getenv("SHIPROCKET_API_EMAIL")
    password = os.getenv("SHIPROCKET_API_PASSWORD")
    
    print(f"Testing credentials for: {email}")
    print("-" * 50)
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "https://apiv2.shiprocket.in/v1/external/auth/login",
                json={"email": email, "password": password},
                timeout=30.0
            )
            
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.json()}")
            
            if response.status_code == 200:
                data = response.json()
                print("\n✅ SUCCESS! Token generated successfully")
                print(f"Token (first 50 chars): {data.get('token', '')[:50]}...")
            else:
                print("\n❌ FAILED! Invalid credentials")
                print("\nTo fix this:")
                print("1. Login to https://app.shiprocket.in")
                print("2. Go to Settings -> API -> Generate API Credentials")
                print("3. Use the EMAIL and PASSWORD from there")
                print("4. Update the .env file with correct credentials")
                
        except Exception as e:
            print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(test_credentials())
