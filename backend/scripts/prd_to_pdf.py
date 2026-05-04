"""Render /app/memory/PRD.md → /app/frontend/public/locofast-prd.pdf using ReportLab.
A pragmatic markdown-ish renderer (headings, bullets, code, bold/italic, tables).
"""
import re
from pathlib import Path
from html import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Preformatted, Table, TableStyle, ListFlowable, ListItem,
)
from reportlab.lib.enums import TA_LEFT

SRC = Path("/app/memory/PRD.md")
DST = Path("/app/frontend/public/locofast-prd.pdf")

INK = colors.HexColor("#0f172a")
SUBTLE = colors.HexColor("#475569")
ACCENT = colors.HexColor("#2563EB")
CARD = colors.HexColor("#f1f5f9")
BORDER = colors.HexColor("#e2e8f0")

styles = getSampleStyleSheet()
BASE = ParagraphStyle(
    "Base", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=10, leading=14, textColor=INK, alignment=TA_LEFT,
    spaceAfter=4,
)
H1 = ParagraphStyle("H1", parent=BASE, fontName="Helvetica-Bold", fontSize=22,
                     leading=28, textColor=INK, spaceBefore=14, spaceAfter=10)
H2 = ParagraphStyle("H2", parent=BASE, fontName="Helvetica-Bold", fontSize=15,
                     leading=20, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle("H3", parent=BASE, fontName="Helvetica-Bold", fontSize=12,
                     leading=16, textColor=INK, spaceBefore=10, spaceAfter=4)
H4 = ParagraphStyle("H4", parent=BASE, fontName="Helvetica-Bold", fontSize=11,
                     leading=14, textColor=SUBTLE, spaceBefore=8, spaceAfter=2)
LI = ParagraphStyle("LI", parent=BASE, leftIndent=12, bulletIndent=0,
                     fontSize=10, leading=14, spaceAfter=2)
CODE = ParagraphStyle("CODE", parent=BASE, fontName="Courier", fontSize=9,
                       leading=12, textColor=INK, leftIndent=8, rightIndent=8,
                       backColor=CARD, borderColor=BORDER, borderWidth=0.5,
                       borderPadding=6, spaceAfter=8, spaceBefore=4)


def inline(text: str) -> str:
    """Basic markdown inline → ReportLab markup."""
    # Escape first, then re-enable our markup tags
    t = escape(text, quote=False)
    # bold **..** and __..__
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"__(.+?)__", r"<b>\1</b>", t)
    # italic *..* and _.._
    t = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", t)
    # inline code `..`
    t = re.sub(r"`([^`]+)`",
               r'<font face="Courier" color="#1e293b" backColor="#f1f5f9">\1</font>',
               t)
    # strikethrough ~~..~~
    t = re.sub(r"~~(.+?)~~", r"<strike>\1</strike>", t)
    # [text](url) — just keep the text and colour it
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
               r'<font color="#2563EB"><u>\1</u></font>', t)
    return t


def parse(md: str):
    """Yield flowables from markdown text."""
    lines = md.splitlines()
    flows = []
    i = 0
    # First H1 becomes title
    while i < len(lines):
        line = lines[i].rstrip()

        # Horizontal rule
        if re.match(r"^\s*---+\s*$", line):
            flows.append(Spacer(1, 4))
            flows.append(Table([[""]], colWidths=[170 * mm],
                               style=TableStyle([
                                   ("LINEABOVE", (0, 0), (-1, -1), 0.6, BORDER),
                               ])))
            flows.append(Spacer(1, 6))
            i += 1
            continue

        # Headings
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            level = len(m.group(1))
            txt = inline(m.group(2).strip())
            style = {1: H1, 2: H2, 3: H3}.get(level, H4)
            flows.append(Paragraph(txt, style))
            i += 1
            continue

        # Fenced code block ```
        if line.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            flows.append(Preformatted("\n".join(buf) or " ", CODE))
            continue

        # Table (markdown pipe table)
        if "|" in line and i + 1 < len(lines) and re.match(r"^\s*\|?[-:\s|]+\|?\s*$", lines[i + 1]):
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            data = [[Paragraph(inline(c), BASE) for c in header]] + [
                [Paragraph(inline(c), BASE) for c in r] for r in rows
            ]
            ncols = len(header)
            col_widths = [170 * mm / ncols] * ncols
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            flows.append(tbl)
            flows.append(Spacer(1, 6))
            continue

        # Bullet list
        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                txt = re.sub(r"^\s*[-*]\s+", "", lines[i])
                # Handle task list [x] / [ ]
                tm = re.match(r"^\[( |x|X)\]\s*(.*)", txt)
                if tm:
                    mark = "☑" if tm.group(1).lower() == "x" else "☐"
                    txt = f"{mark} {tm.group(2)}"
                items.append(ListItem(Paragraph(inline(txt), LI),
                                       leftIndent=10, bulletColor=ACCENT))
                i += 1
            flows.append(ListFlowable(items, bulletType="bullet",
                                       start="•", leftIndent=14))
            flows.append(Spacer(1, 4))
            continue

        # Numbered list
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                txt = re.sub(r"^\s*\d+\.\s+", "", lines[i])
                items.append(ListItem(Paragraph(inline(txt), LI),
                                       leftIndent=10))
                i += 1
            flows.append(ListFlowable(items, bulletType="1",
                                       leftIndent=18))
            flows.append(Spacer(1, 4))
            continue

        # Blank line
        if not line.strip():
            flows.append(Spacer(1, 4))
            i += 1
            continue

        # Paragraph (collapse soft-wraps)
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(
            r"^(#{1,6}\s|```|[-*]\s|\d+\.\s|---|\|)", lines[i]
        ):
            buf.append(lines[i])
            i += 1
        flows.append(Paragraph(inline(" ".join(buf)), BASE))

    return flows


def add_page_chrome(canvas, doc):
    canvas.saveState()
    # Footer
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SUBTLE)
    page_num = canvas.getPageNumber()
    canvas.drawString(20 * mm, 12 * mm, "Locofast v2 — Product Requirements Document")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {page_num}")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.3)
    canvas.line(20 * mm, 16 * mm, A4[0] - 20 * mm, 16 * mm)
    canvas.restoreState()


def main():
    md = SRC.read_text(encoding="utf-8")
    # Inject a subtle header block before parsing
    header = (
        "# Locofast v2 — Product Requirements\n\n"
        "*Generated from /app/memory/PRD.md — single source of truth for project scope.*\n\n"
        "---\n\n"
    )
    md_full = header + md
    DST.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(DST), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
        title="Locofast v2 — PRD", author="Locofast",
    )
    doc.build(parse(md_full), onFirstPage=add_page_chrome,
              onLaterPages=add_page_chrome)
    print(f"Wrote {DST}  ({DST.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
