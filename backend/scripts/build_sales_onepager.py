"""
Sales One-Pager PDF — Locofast Enterprise Portal.

Generates `/app/memory/Locofast_Enterprise_Sales_OnePager.pdf` from screenshots
in `/app/memory/sales_screenshots/`. Designed as a 2-page A4 deck the sales
team can print double-sided and hand to a brand prospect.

Page 1 — pitch (logo, value props, 3 hero screenshots in a grid)
Page 2 — feature deep-dive (3 more screenshots + bullet captions + CTA)
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

# --------------------------------------------------------------------------- #
# Brand palette (drawn from the running app — emerald primary, neutral support)
# --------------------------------------------------------------------------- #
BRAND_GREEN = HexColor("#059669")    # primary emerald (from buttons/headings)
BRAND_GREEN_DARK = HexColor("#047857")
BRAND_AMBER = HexColor("#D97706")    # for "sample credits" callout
INK = HexColor("#0F172A")            # near-black headings
INK_SOFT = HexColor("#475569")       # body text grey
INK_FAINT = HexColor("#94A3B8")      # captions
BG_TINT = HexColor("#ECFDF5")        # sub-header tint
BORDER = HexColor("#E2E8F0")
PILL_BG = HexColor("#F1F5F9")

PAGE_W, PAGE_H = A4
MARGIN_X = 14 * mm
SHOTS = "/app/memory/sales_screenshots"
OUT = "/app/memory/Locofast_Enterprise_Sales_OnePager.pdf"

# --------------------------------------------------------------------------- #
# Try to register a nice sans font; fall back to Helvetica if unavailable.
# --------------------------------------------------------------------------- #
def _try_font():
    candidates = [
        ("Inter", "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
                  "/usr/share/fonts/truetype/inter/Inter-Bold.ttf"),
        ("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                   "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for name, reg, bold in candidates:
        if os.path.exists(reg) and os.path.exists(bold):
            try:
                pdfmetrics.registerFont(TTFont(name, reg))
                pdfmetrics.registerFont(TTFont(name + "-Bold", bold))
                return name
            except Exception:
                continue
    return None

FONT = _try_font()
F_REG = FONT or "Helvetica"
F_BOLD = (FONT + "-Bold") if FONT else "Helvetica-Bold"


# --------------------------------------------------------------------------- #
# Drawing primitives
# --------------------------------------------------------------------------- #
def draw_header(c):
    """Brand band across the top of every page."""
    c.setFillColor(BRAND_GREEN)
    c.rect(0, PAGE_H - 18 * mm, PAGE_W, 18 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(F_BOLD, 18)
    c.drawString(MARGIN_X, PAGE_H - 11 * mm, "Locofast")
    c.setFont(F_REG, 9)
    c.drawString(MARGIN_X + 26 * mm, PAGE_H - 11 * mm, "Enterprise Portal")
    c.setFont(F_REG, 8)
    c.setFillColor(white)
    c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 11 * mm,
                       "B2B Fabric Sourcing  ·  locofast.com")


def draw_footer(c, page_num):
    c.setFillColor(INK_FAINT)
    c.setFont(F_REG, 7)
    c.drawString(MARGIN_X, 8 * mm,
                 "Confidential — for sales-team distribution. © 2026 Locofast.")
    c.drawRightString(PAGE_W - MARGIN_X, 8 * mm, f"Page {page_num} / 2")


def draw_pill(c, x, y, label, fg=BRAND_GREEN, bg=BG_TINT):
    """Small rounded chip, used for taglines."""
    c.setFont(F_BOLD, 7.5)
    text_w = c.stringWidth(label, F_BOLD, 7.5)
    pad_x, h = 4, 4.5 * mm
    c.setFillColor(bg)
    c.roundRect(x, y, text_w + 2 * pad_x, h, h / 2, fill=1, stroke=0)
    c.setFillColor(fg)
    c.drawString(x + pad_x, y + 1.4 * mm, label)


def draw_shot(c, path, x, y, w, h, caption_top=None, badges=None):
    """Place a screenshot inside a card with shadow + caption + optional badges.

    `badges` is a list of (label, fg_color) drawn over the image's top-right.
    """
    # Soft shadow underneath
    c.setFillColor(HexColor("#0f172a"))
    c.setFillAlpha(0.06)
    c.roundRect(x + 0.6 * mm, y - 0.6 * mm, w, h, 2 * mm, fill=1, stroke=0)
    c.setFillAlpha(1)

    # Card
    c.setStrokeColor(BORDER)
    c.setFillColor(white)
    c.roundRect(x, y, w, h, 2 * mm, fill=1, stroke=1)

    # Caption strip at top of card
    if caption_top:
        c.setFillColor(INK)
        c.setFont(F_BOLD, 8.5)
        c.drawString(x + 3 * mm, y + h - 4.3 * mm, caption_top)

    img_y_top = y + h - (5.5 * mm if caption_top else 1 * mm)
    img_y_bot = y + 2.3 * mm
    img_h = img_y_top - img_y_bot
    img_w = w - 4 * mm
    img_x = x + 2 * mm
    try:
        img = ImageReader(path)
        c.drawImage(img, img_x, img_y_bot, img_w, img_h,
                    preserveAspectRatio=True, anchor='n', mask='auto')
    except Exception as e:
        c.setFillColor(INK_FAINT)
        c.setFont(F_REG, 8)
        c.drawString(img_x, img_y_bot + img_h / 2, f"[image missing: {e}]")

    # Badges over image
    if badges:
        bx = x + w - 3 * mm
        by = img_y_top - 5 * mm
        for label, color in badges:
            c.setFont(F_BOLD, 6.5)
            tw = c.stringWidth(label, F_BOLD, 6.5)
            pad = 3
            c.setFillColor(color)
            c.roundRect(bx - tw - 2 * pad, by, tw + 2 * pad, 4 * mm, 2, fill=1, stroke=0)
            c.setFillColor(white)
            c.drawString(bx - tw - pad, by + 1.2 * mm, label)
            by -= 5.5 * mm


def draw_value_prop(c, x, y, num, title, body, color=BRAND_GREEN):
    """Numbered value prop block."""
    # Number bullet
    c.setFillColor(color)
    c.circle(x + 3.2 * mm, y - 2.5 * mm, 3.2 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(F_BOLD, 9)
    c.drawCentredString(x + 3.2 * mm, y - 4 * mm, str(num))

    # Title
    c.setFillColor(INK)
    c.setFont(F_BOLD, 9.2)
    c.drawString(x + 8 * mm, y - 2.5 * mm, title)

    # Body — wrap to width
    c.setFillColor(INK_SOFT)
    c.setFont(F_REG, 7.8)
    body_y = y - 6.3 * mm
    line_h = 3.4 * mm
    max_w = 78 * mm
    words = body.split()
    line = ""
    for w_ in words:
        test = (line + " " + w_).strip()
        if c.stringWidth(test, F_REG, 7.8) > max_w and line:
            c.drawString(x + 8 * mm, body_y, line)
            body_y -= line_h
            line = w_
        else:
            line = test
    if line:
        c.drawString(x + 8 * mm, body_y, line)


# --------------------------------------------------------------------------- #
# Page 1 — Pitch
# --------------------------------------------------------------------------- #
def page_one(c):
    draw_header(c)

    # Hero pitch
    y = PAGE_H - 30 * mm
    draw_pill(c, MARGIN_X, y, "ENTERPRISE PORTAL  ·  FOR FASHION BRANDS",
              fg=white, bg=BRAND_GREEN_DARK)

    c.setFillColor(INK)
    c.setFont(F_BOLD, 22)
    c.drawString(MARGIN_X, y - 9 * mm,
                 "Replace 4 sourcing tools with one dashboard.")
    c.setFillColor(INK_SOFT)
    c.setFont(F_REG, 11)
    c.drawString(MARGIN_X, y - 16 * mm,
                 "Curated catalog. Embedded credit. Team workflow. Same-day onboarding.")

    # Stats row
    stats_y = y - 26 * mm
    stats = [
        ("700+", "Brands served"),
        ("500+", "Verified vendors"),
        ("5,000+", "Orders shipped"),
        ("0", "Platform fee for brands"),
    ]
    cell_w = (PAGE_W - 2 * MARGIN_X) / 4
    for i, (n, lbl) in enumerate(stats):
        cx = MARGIN_X + i * cell_w
        c.setFillColor(BG_TINT)
        c.roundRect(cx + 2, stats_y - 12 * mm, cell_w - 4, 14 * mm, 2 * mm, fill=1, stroke=0)
        c.setFillColor(BRAND_GREEN_DARK)
        c.setFont(F_BOLD, 16)
        c.drawString(cx + 5 * mm, stats_y - 5 * mm, n)
        c.setFillColor(INK_SOFT)
        c.setFont(F_REG, 7.5)
        c.drawString(cx + 5 * mm, stats_y - 9 * mm, lbl)

    # 3-column value props
    vp_y = stats_y - 18 * mm
    col_w = (PAGE_W - 2 * MARGIN_X) / 2
    props = [
        ("01", "Curated catalog",
         "Each brand gets a personalised view (Denim, Cotton, Knits…) — no scrolling through 200+ generic SKUs."),
        ("02", "Embedded credit lines",
         "Pre-approved working capital from Stride, Mintifi, Muthoot — pick a lender at checkout, place orders on credit."),
        ("03", "Sample-credit wallet",
         "Top-up via Razorpay or admin OTP. Merchandisers order swatches without per-PO finance approvals."),
        ("04", "Multi-tenant: invite factories",
         "Onboard your sub-contracting factories. They inherit your category access + credit line — Locofast verifies."),
        ("05", "Tech-pack + PO upload at cart",
         "Attach buyer POs and your tech pack as files. Every order has full paperwork — no separate emails."),
        ("06", "Predictable dispatch SLAs",
         "Ready Stock 1–14 days; Made-to-Order 15–75 days. Same SLA for bulk and samples — contractually committed."),
    ]
    for i, (n, t, b) in enumerate(props):
        col = i % 2
        row = i // 2
        x = MARGIN_X + col * col_w
        y = vp_y - row * 18 * mm
        draw_value_prop(c, x, y, n, t, b)

    # Hero strip — 2 wide screenshots side-by-side
    strip_y = 35 * mm
    strip_h = 50 * mm
    half_w = (PAGE_W - 2 * MARGIN_X - 4 * mm) / 2
    draw_shot(c, f"{SHOTS}/02_catalog.jpeg",
              MARGIN_X, strip_y, half_w, strip_h,
              caption_top="Curated Catalog · Brand-specific filters",
              badges=[("Cheapest bulk anchor", BRAND_GREEN)])
    draw_shot(c, f"{SHOTS}/03_credit.jpeg",
              MARGIN_X + half_w + 4 * mm, strip_y, half_w, strip_h,
              caption_top="Credit & Sample Accounts",
              badges=[("₹3.86L available", BRAND_GREEN), ("192 samples", BRAND_AMBER)])

    # Footer pitch line
    c.setFillColor(BRAND_GREEN_DARK)
    c.setFont(F_BOLD, 9)
    c.drawCentredString(PAGE_W / 2, 25 * mm,
                        "→ Same-day onboarding. Free for brands. Sign up via your Locofast relationship manager.")
    draw_footer(c, 1)


# --------------------------------------------------------------------------- #
# Page 2 — Feature deep-dive
# --------------------------------------------------------------------------- #
def page_two(c):
    c.showPage()
    draw_header(c)

    y = PAGE_H - 30 * mm
    draw_pill(c, MARGIN_X, y, "INSIDE THE PORTAL")
    c.setFillColor(INK)
    c.setFont(F_BOLD, 18)
    c.drawString(MARGIN_X, y - 9 * mm, "What your team actually uses every day.")
    c.setFillColor(INK_SOFT)
    c.setFont(F_REG, 10)
    c.drawString(MARGIN_X, y - 15 * mm,
                 "From login to dispatch — every step lives in one branded portal under your subdomain.")

    # 4-card grid
    grid_top = y - 25 * mm
    card_w = (PAGE_W - 2 * MARGIN_X - 6 * mm) / 2
    card_h = 58 * mm

    # row 1
    draw_shot(c, f"{SHOTS}/01_login.jpeg",
              MARGIN_X, grid_top - card_h, card_w, card_h,
              caption_top="01 · Branded sign-in",
              badges=[("SSO-ready", BRAND_GREEN)])

    draw_shot(c, f"{SHOTS}/04_users.jpeg",
              MARGIN_X + card_w + 6 * mm, grid_top - card_h, card_w, card_h,
              caption_top="02 · Multi-user team management",
              badges=[("Role-based", BRAND_GREEN)])

    # row 2
    row2_top = grid_top - card_h - 8 * mm
    draw_shot(c, f"{SHOTS}/05_factories.jpeg",
              MARGIN_X, row2_top - card_h, card_w, card_h,
              caption_top="03 · Invite your factories (multi-tenant)",
              badges=[("Auto-inherits", BRAND_GREEN)])

    draw_shot(c, f"{SHOTS}/06_orders.jpeg",
              MARGIN_X + card_w + 6 * mm, row2_top - card_h, card_w, card_h,
              caption_top="04 · Orders paid via Credit Line / Sample Credits",
              badges=[("Full audit", BRAND_GREEN)])

    # CTA strip
    cta_y = 22 * mm
    c.setFillColor(BRAND_GREEN)
    c.roundRect(MARGIN_X, cta_y, PAGE_W - 2 * MARGIN_X, 18 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(F_BOLD, 13)
    c.drawString(MARGIN_X + 6 * mm, cta_y + 11 * mm,
                 "Ready to onboard your sourcing team?")
    c.setFont(F_REG, 9)
    c.drawString(MARGIN_X + 6 * mm, cta_y + 5.5 * mm,
                 "Book a 15-min demo  ·  support@locofast.com  ·  +91 120 4938200  ·  Mon–Sat 9:30 – 19:00 IST")
    # Pill on right of CTA
    pill_label = "locofast.com / enterprise"
    c.setFont(F_BOLD, 8)
    pw = c.stringWidth(pill_label, F_BOLD, 8) + 12
    px = PAGE_W - MARGIN_X - pw - 4 * mm
    py = cta_y + 6 * mm
    c.setFillColor(white)
    c.roundRect(px, py, pw, 6 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(BRAND_GREEN_DARK)
    c.drawCentredString(px + pw / 2, py + 1.8 * mm, pill_label)

    draw_footer(c, 2)


def build():
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("Locofast Enterprise — Sales One-Pager")
    c.setAuthor("Locofast")
    c.setSubject("Enterprise Portal pitch deck for sales team")
    page_one(c)
    page_two(c)
    c.save()
    return OUT


if __name__ == "__main__":
    p = build()
    print(f"WROTE {p} ({os.path.getsize(p) // 1024} KB)")
