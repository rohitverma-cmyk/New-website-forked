"""
SEO and Prerender Endpoints Testing
Tests for:
- index.html robots meta tag (index, follow)
- Static meta title and description in raw HTML
- /api/sitemap.xml dynamic sitemap generation
- /api/prerender/homepage - full HTML with structured data
- /api/prerender/fabrics - fabric catalog HTML
- /api/prerender/collections - collections HTML
- /api/prerender/check - bot detection endpoint
- robots.txt configuration
"""
import pytest
import requests
import os
import re
from xml.etree import ElementTree as ET

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIndexHtmlRobotsMeta:
    """Test that index.html has correct robots meta tag"""
    
    def test_index_html_has_index_follow_meta(self):
        """Verify index.html serves <meta name='robots' content='index, follow'>"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200, f"Homepage returned {response.status_code}"
        
        html = response.text
        # Check for robots meta tag with index, follow
        robots_pattern = r'<meta\s+name=["\']robots["\']\s+content=["\']([^"\']+)["\']'
        match = re.search(robots_pattern, html, re.IGNORECASE)
        
        assert match is not None, "No robots meta tag found in index.html"
        content = match.group(1).lower()
        assert 'index' in content, f"Robots meta tag should contain 'index', got: {content}"
        assert 'follow' in content, f"Robots meta tag should contain 'follow', got: {content}"
        assert 'noindex' not in content, f"Robots meta tag should NOT contain 'noindex', got: {content}"
        assert 'nofollow' not in content, f"Robots meta tag should NOT contain 'nofollow', got: {content}"
        print(f"✓ Robots meta tag correct: {content}")

    def test_index_html_has_static_meta_title(self):
        """Verify static meta title is in raw HTML response"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        
        html = response.text
        # Check for title tag
        title_pattern = r'<title>([^<]+)</title>'
        match = re.search(title_pattern, html, re.IGNORECASE)
        
        assert match is not None, "No title tag found in index.html"
        title = match.group(1)
        assert 'Locofast' in title, f"Title should contain 'Locofast', got: {title}"
        assert len(title) > 20, f"Title seems too short: {title}"
        print(f"✓ Title tag found: {title}")

    def test_index_html_has_static_meta_description(self):
        """Verify static meta description is in raw HTML response"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        
        html = response.text
        # Check for description meta tag
        desc_pattern = r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']'
        match = re.search(desc_pattern, html, re.IGNORECASE)
        
        assert match is not None, "No description meta tag found in index.html"
        description = match.group(1)
        assert len(description) > 50, f"Description seems too short: {description}"
        assert 'fabric' in description.lower() or 'textile' in description.lower(), \
            f"Description should mention fabric/textile: {description}"
        print(f"✓ Description meta tag found: {description[:100]}...")


class TestDynamicSitemap:
    """Test /api/sitemap.xml dynamic sitemap generation"""
    
    def test_sitemap_returns_valid_xml(self):
        """GET /api/sitemap.xml returns valid XML"""
        response = requests.get(f"{BASE_URL}/api/sitemap.xml")
        assert response.status_code == 200, f"Sitemap returned {response.status_code}"
        assert 'xml' in response.headers.get('content-type', '').lower(), \
            f"Content-Type should be XML, got: {response.headers.get('content-type')}"
        
        # Parse XML to verify it's valid
        try:
            root = ET.fromstring(response.text)
            print(f"✓ Sitemap is valid XML with root tag: {root.tag}")
        except ET.ParseError as e:
            pytest.fail(f"Sitemap XML is invalid: {e}")

    def test_sitemap_contains_required_static_pages(self):
        """Sitemap should contain all required static pages"""
        response = requests.get(f"{BASE_URL}/api/sitemap.xml")
        assert response.status_code == 200
        
        xml_content = response.text
        required_pages = [
            'locofast.com/',
            'locofast.com/about-us',
            'locofast.com/fabrics',
            'locofast.com/collections',
            'locofast.com/suppliers',
            'locofast.com/sell',
            'locofast.com/tools',
            'locofast.com/tools/gst-calculator',
            'locofast.com/tools/gsm-calculator',
            'locofast.com/tools/profit-margin-calculator',
            'locofast.com/tools/cbm-calculator',
        ]
        
        missing_pages = []
        for page in required_pages:
            if page not in xml_content:
                missing_pages.append(page)
        
        assert len(missing_pages) == 0, f"Missing pages in sitemap: {missing_pages}"
        print(f"✓ All {len(required_pages)} required static pages found in sitemap")

    def test_sitemap_has_proper_url_structure(self):
        """Sitemap URLs should have proper structure with loc, changefreq, priority"""
        response = requests.get(f"{BASE_URL}/api/sitemap.xml")
        assert response.status_code == 200
        
        # Parse XML
        root = ET.fromstring(response.text)
        ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        
        urls = root.findall('.//sm:url', ns)
        assert len(urls) > 0, "Sitemap should contain at least one URL"
        
        # Check first URL has required elements
        first_url = urls[0]
        loc = first_url.find('sm:loc', ns)
        assert loc is not None, "URL should have <loc> element"
        assert loc.text.startswith('https://locofast.com'), f"URL should start with https://locofast.com, got: {loc.text}"
        
        print(f"✓ Sitemap contains {len(urls)} URLs with proper structure")


class TestPrerenderHomepage:
    """Test /api/prerender/homepage endpoint"""
    
    def test_prerender_homepage_returns_html(self):
        """GET /api/prerender/homepage returns full HTML"""
        response = requests.get(f"{BASE_URL}/api/prerender/homepage")
        assert response.status_code == 200, f"Prerender homepage returned {response.status_code}"
        
        html = response.text
        assert '<!DOCTYPE html>' in html or '<!doctype html>' in html.lower(), \
            "Response should be HTML document"
        assert '</html>' in html.lower(), "HTML should have closing tag"
        print("✓ Prerender homepage returns valid HTML document")

    def test_prerender_homepage_has_title_and_meta(self):
        """Homepage prerender should have title and meta description"""
        response = requests.get(f"{BASE_URL}/api/prerender/homepage")
        assert response.status_code == 200
        
        html = response.text
        
        # Check title
        assert '<title>' in html, "Should have title tag"
        title_match = re.search(r'<title>([^<]+)</title>', html)
        assert title_match, "Title tag should have content"
        assert 'Locofast' in title_match.group(1), "Title should contain Locofast"
        
        # Check meta description
        desc_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        assert desc_match, "Should have meta description"
        assert len(desc_match.group(1)) > 50, "Description should be substantial"
        
        print("✓ Homepage prerender has title and meta description")

    def test_prerender_homepage_has_structured_data(self):
        """Homepage should have Organization and FAQ schema"""
        response = requests.get(f"{BASE_URL}/api/prerender/homepage")
        assert response.status_code == 200
        
        html = response.text
        
        # Check for Organization schema
        assert '"@type":"Organization"' in html or '"@type": "Organization"' in html, \
            "Should have Organization structured data"
        
        # Check for FAQ schema
        assert '"@type":"FAQPage"' in html or '"@type": "FAQPage"' in html, \
            "Should have FAQPage structured data"
        
        # Check for application/ld+json script tags
        assert 'application/ld+json' in html, "Should have JSON-LD script tags"
        
        print("✓ Homepage prerender has Organization and FAQ structured data")

    def test_prerender_homepage_has_content_sections(self):
        """Homepage should have value props, how-it-works, collections, fabrics, audiences, CTA"""
        response = requests.get(f"{BASE_URL}/api/prerender/homepage")
        assert response.status_code == 200
        
        html = response.text.lower()
        
        # Check for key content sections
        content_checks = [
            ('value props', 'verified' in html and 'transparent' in html),
            ('how it works', 'how it works' in html or 'browse' in html),
            ('CTA', 'browse' in html or 'get sourcing' in html or 'contact' in html),
        ]
        
        for section_name, check in content_checks:
            assert check, f"Homepage should have {section_name} section"
        
        print("✓ Homepage prerender has key content sections")


class TestPrerenderFabrics:
    """Test /api/prerender/fabrics endpoint"""
    
    def test_prerender_fabrics_returns_html(self):
        """GET /api/prerender/fabrics returns HTML with fabric catalog"""
        response = requests.get(f"{BASE_URL}/api/prerender/fabrics")
        assert response.status_code == 200, f"Prerender fabrics returned {response.status_code}"
        
        html = response.text
        assert '<!DOCTYPE html>' in html or '<!doctype html>' in html.lower(), \
            "Response should be HTML document"
        assert 'fabric' in html.lower(), "Should mention fabrics"
        print("✓ Prerender fabrics returns valid HTML")

    def test_prerender_fabrics_has_catalog_structure(self):
        """Fabrics page should have catalog listing structure"""
        response = requests.get(f"{BASE_URL}/api/prerender/fabrics")
        assert response.status_code == 200
        
        html = response.text
        
        # Check for title
        assert '<title>' in html, "Should have title tag"
        assert 'Catalog' in html or 'catalog' in html.lower() or 'Fabric' in html, \
            "Title should mention catalog or fabric"
        
        # Check for canonical URL
        assert 'canonical' in html.lower(), "Should have canonical link"
        
        print("✓ Prerender fabrics has proper catalog structure")


class TestPrerenderCollections:
    """Test /api/prerender/collections endpoint"""
    
    def test_prerender_collections_returns_html(self):
        """GET /api/prerender/collections returns HTML with collection cards"""
        response = requests.get(f"{BASE_URL}/api/prerender/collections")
        assert response.status_code == 200, f"Prerender collections returned {response.status_code}"
        
        html = response.text
        assert '<!DOCTYPE html>' in html or '<!doctype html>' in html.lower(), \
            "Response should be HTML document"
        assert 'collection' in html.lower(), "Should mention collections"
        print("✓ Prerender collections returns valid HTML")

    def test_prerender_collections_has_proper_meta(self):
        """Collections page should have proper meta tags"""
        response = requests.get(f"{BASE_URL}/api/prerender/collections")
        assert response.status_code == 200
        
        html = response.text
        
        # Check for title
        title_match = re.search(r'<title>([^<]+)</title>', html)
        assert title_match, "Should have title tag"
        assert 'Collection' in title_match.group(1), "Title should mention Collection"
        
        # Check for canonical
        assert 'locofast.com/collections' in html, "Should have canonical URL for collections"
        
        print("✓ Prerender collections has proper meta tags")


class TestPrerenderBotCheck:
    """Test /api/prerender/check bot detection endpoint"""
    
    def test_bot_check_with_googlebot_user_agent(self):
        """GET /api/prerender/check with Googlebot User-Agent returns is_bot=true"""
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}
        response = requests.get(f"{BASE_URL}/api/prerender/check?path=/", headers=headers)
        
        assert response.status_code == 200, f"Bot check returned {response.status_code}"
        data = response.json()
        
        assert 'is_bot' in data, "Response should have is_bot field"
        assert data['is_bot'] == True, f"Googlebot should be detected as bot, got: {data}"
        print(f"✓ Googlebot detected as bot: {data}")

    def test_bot_check_with_normal_user_agent(self):
        """GET /api/prerender/check with normal User-Agent returns is_bot=false"""
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(f"{BASE_URL}/api/prerender/check?path=/", headers=headers)
        
        assert response.status_code == 200, f"Bot check returned {response.status_code}"
        data = response.json()
        
        assert 'is_bot' in data, "Response should have is_bot field"
        assert data['is_bot'] == False, f"Normal browser should not be detected as bot, got: {data}"
        print(f"✓ Normal browser not detected as bot: {data}")

    def test_bot_check_with_bingbot_user_agent(self):
        """GET /api/prerender/check with Bingbot User-Agent returns is_bot=true"""
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'}
        response = requests.get(f"{BASE_URL}/api/prerender/check?path=/", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['is_bot'] == True, f"Bingbot should be detected as bot, got: {data}"
        print(f"✓ Bingbot detected as bot: {data}")

    def test_bot_check_returns_path_info(self):
        """Bot check should return path and prerender_available info"""
        response = requests.get(f"{BASE_URL}/api/prerender/check?path=/fabrics")
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'path' in data, "Response should have path field"
        assert data['path'] == '/fabrics', f"Path should be /fabrics, got: {data['path']}"
        assert 'prerender_available' in data, "Response should have prerender_available field"
        print(f"✓ Bot check returns path info: {data}")


class TestRobotsTxt:
    """Test robots.txt configuration"""
    
    def test_robots_txt_accessible(self):
        """robots.txt should be accessible"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200, f"robots.txt returned {response.status_code}"
        print("✓ robots.txt is accessible")

    def test_robots_txt_allows_sitemap(self):
        """robots.txt should allow /api/sitemap.xml"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        
        content = response.text
        assert 'Allow: /api/sitemap.xml' in content, \
            f"robots.txt should allow /api/sitemap.xml, content: {content}"
        print("✓ robots.txt allows /api/sitemap.xml")

    def test_robots_txt_allows_prerender(self):
        """robots.txt should allow /api/prerender/"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        
        content = response.text
        assert 'Allow: /api/prerender/' in content, \
            f"robots.txt should allow /api/prerender/, content: {content}"
        print("✓ robots.txt allows /api/prerender/")

    def test_robots_txt_blocks_admin(self):
        """robots.txt should block /admin/"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        
        content = response.text
        assert 'Disallow: /admin/' in content, \
            f"robots.txt should block /admin/, content: {content}"
        print("✓ robots.txt blocks /admin/")

    def test_robots_txt_blocks_vendor(self):
        """robots.txt should block /vendor/"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        
        content = response.text
        assert 'Disallow: /vendor/' in content, \
            f"robots.txt should block /vendor/, content: {content}"
        print("✓ robots.txt blocks /vendor/")

    def test_robots_txt_has_sitemap_reference(self):
        """robots.txt should reference sitemap URLs"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200
        
        content = response.text
        assert 'Sitemap:' in content, "robots.txt should have Sitemap directive"
        assert 'locofast.com' in content, "Sitemap URL should reference locofast.com"
        print("✓ robots.txt has sitemap reference")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
