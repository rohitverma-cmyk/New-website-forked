"""Packing Slip PDF generator.

Renders a vendor-side packing document per order. Each line item is
expanded into one row PER ROLL (Roll 1/3 · 50m · Order LF/ORD/X · SKU
LF-XXX) so warehouse staff can hand-label rolls without re-typing.

Used by GET /api/orders/{order_id}/packing-slip.
"""
from __future__ import annotations

import logging
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

logger = logging.getLogger(__name__)


def _addr(customer: dict) -> str:
    parts = [
        customer.get("name") or "",
        customer.get("company") or "",
        customer.get("address") or "",
        ", ".join(
            p for p in (customer.get("city"), customer.get("state"), customer.get("pincode")) if p
        ),
    ]
    parts = [p for p in parts if p]
    return "<br/>".join(parts) if parts else "—"


def generate_packing_slip_pdf(order: dict, seller_id: str | None = None) -> BytesIO:
    """Build a packing slip for one vendor's items in an order. When
    `seller_id` is None we render every supplier on the order; otherwise
    only the matching items appear. Returns a seekable BytesIO."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    label_st = ParagraphStyle("Label", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#666"))
    value_st = ParagraphStyle("Value", parent=styles["Normal"], fontSize=10, leading=12)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, leading=22, textColor=colors.HexColor("#0F172A"))
    pill = ParagraphStyle("Pill", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#0F766E"))

    story = []

    # ── Header ────────────────────────────────────────────────
    order_number = order.get("order_number") or order.get("id", "")[:8]
    header_tbl = Table(
        [[
            Paragraph("<b>PACKING SLIP</b>", h1),
            Paragraph(
                f'<font color="#666" size="9">Locofast · Internal Document</font><br/>'
                f'<font size="10"><b>Order:</b> {order_number}</font><br/>'
                f'<font color="#888" size="8">Goods Ready: {order.get("goods_ready_at","—")[:19].replace("T"," ")} UTC</font>',
                value_st,
            ),
        ]],
        colWidths=[110 * mm, 70 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6 * mm))

    # ── From / To panels ──────────────────────────────────────
    items = order.get("items") or []
    if seller_id:
        items = [it for it in items if (it.get("seller_id") or "") == seller_id]

    # Resolve unique supplier(s) shown on this slip
    suppliers = []
    seen = set()
    for it in items:
        sid = it.get("seller_id") or ""
        if sid and sid not in seen:
            seen.add(sid)
            suppliers.append({
                "id": sid,
                "company": it.get("seller_company") or "—",
            })

    from_html = "<br/>".join(
        [f"<b>{s['company']}</b>" for s in suppliers] or ["—"]
    )
    to_html = _addr(order.get("customer") or {})

    addr_tbl = Table(
        [[
            Paragraph(f'<font size="7" color="#999">FROM (SUPPLIER)</font><br/>{from_html}', value_st),
            Paragraph(f'<font size="7" color="#999">SHIP TO (CUSTOMER)</font><br/>{to_html}', value_st),
        ]],
        colWidths=[90 * mm, 90 * mm],
    )
    addr_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(addr_tbl)
    story.append(Spacer(1, 6 * mm))

    # ── Roll-level table ─────────────────────────────────────
    table_data = [[
        Paragraph("<b>Roll</b>", label_st),
        Paragraph("<b>Length</b>", label_st),
        Paragraph("<b>Fabric · SKU</b>", label_st),
        Paragraph("<b>Order Type</b>", label_st),
        Paragraph("<b>Customer Ref</b>", label_st),
    ]]

    total_meters = 0.0
    total_rolls = 0
    for it in items:
        rolls = it.get("dispatch_rolls") or []
        # Flatten { count: 3, length: 50 } → 3 rows of 50m
        flat = []
        for r in rolls:
            try:
                cnt = int(r.get("count") or 0)
                ln = float(r.get("length") or 0)
            except (TypeError, ValueError):
                continue
            for _ in range(cnt):
                flat.append(ln)
        # Fallback: if no roll breakdown was captured, render a single
        # line for the booked/actual quantity so the slip is never empty.
        if not flat:
            q = it.get("actual_quantity") if it.get("actual_quantity") is not None else it.get("quantity", 0)
            try:
                q = float(q or 0)
            except (TypeError, ValueError):
                q = 0.0
            if q > 0:
                flat = [q]

        total_for_item = len(flat)
        for idx, length in enumerate(flat, start=1):
            total_meters += length
            total_rolls += 1
            roll_label = f"Roll {idx}/{total_for_item}"
            fabric_cell = (
                f"<b>{it.get('fabric_name','')}</b><br/>"
                f"<font size='8' color='#666'>SKU: {it.get('fabric_code','—')}</font>"
            )
            table_data.append([
                Paragraph(f"<b>{roll_label}</b>", value_st),
                Paragraph(f"<b>{length:.2f} m</b>", value_st),
                Paragraph(fabric_cell, value_st),
                Paragraph((it.get("order_type") or "bulk").upper(), pill),
                Paragraph(order_number, value_st),
            ])

    if len(table_data) == 1:  # only header → no rolls
        story.append(Paragraph(
            "<font color='#dc2626'>No rolls captured for this order.</font>",
            value_st,
        ))
    else:
        # Footer row with totals
        table_data.append([
            Paragraph(f"<b>TOTAL · {total_rolls} rolls</b>", value_st),
            Paragraph(f"<b>{total_meters:.2f} m</b>", value_st),
            "", "", "",
        ])
        tbl = Table(
            table_data,
            colWidths=[28 * mm, 22 * mm, 70 * mm, 22 * mm, 38 * mm],
            repeatRows=1,
        )
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#F0F0F0")),
            ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.HexColor("#9CA3AF")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FAFAFA")),
        ]))
        story.append(tbl)

    story.append(Spacer(1, 6 * mm))

    # ── Dispatch notes (per item) ─────────────────────────────
    notes = [it for it in items if (it.get("dispatch_note") or "").strip()]
    if notes:
        story.append(Paragraph("<b>Dispatch Notes</b>", value_st))
        story.append(Spacer(1, 2 * mm))
        for it in notes:
            story.append(Paragraph(
                f"<font size='9' color='#374151'>• <b>{it.get('fabric_name','')}:</b> {it.get('dispatch_note','')}</font>",
                value_st,
            ))
        story.append(Spacer(1, 4 * mm))

    # ── Footer ────────────────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        '<font size="8" color="#999">Cut along dotted lines and attach one label per roll. '
        'Locofast Online Services Pvt. Ltd. — for internal logistics use only.</font>',
        value_st,
    ))

    doc.build(story)
    buf.seek(0)
    return buf
