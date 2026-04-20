"""Utility to generate URL-safe slugs from fabric names."""
import re


def generate_slug(name: str, fabric_id: str = "") -> str:
    """
    Generate an SEO-friendly slug from a name.
    Uses fabric_id suffix for deterministic uniqueness (not random).
    Example: "Cotton Poplin 60s x 60s" + id "abc123..." -> "cotton-poplin-60s-x-60s-abc123"
    """
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)  # remove non-alphanumeric
    s = re.sub(r'[\s-]+', '-', s)        # collapse spaces/hyphens
    s = s.strip('-')
    # Use first 6 chars of fabric_id for deterministic suffix
    suffix = fabric_id[:6] if fabric_id else ""
    return f"{s}-{suffix}" if s and suffix else (s or suffix or "fabric")
