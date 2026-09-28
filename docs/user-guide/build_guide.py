# IRIS User Guide — PDF generator (ReportLab, pure vector).
# Produces docs/user-guide/IRIS-User-Guide.pdf
# No secrets, no environment details — end-user content only.

import math
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

PW, PH = A4  # 595.27 x 841.89
M = 46       # page margin
CW = PW - 2 * M

FDIR = "/usr/local/lib/python3.11/dist-packages/font_source_sans_pro/files"
pdfmetrics.registerFont(TTFont("SS-Light",    f"{FDIR}/SourceSansPro-Light.ttf"))
pdfmetrics.registerFont(TTFont("SS",          f"{FDIR}/SourceSansPro-Regular.ttf"))
pdfmetrics.registerFont(TTFont("SS-It",       f"{FDIR}/SourceSansPro-It.ttf"))
pdfmetrics.registerFont(TTFont("SS-Semi",     f"{FDIR}/SourceSansPro-Semibold.ttf"))
pdfmetrics.registerFont(TTFont("SS-Bold",     f"{FDIR}/SourceSansPro-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SS-Black",    f"{FDIR}/SourceSansPro-Black.ttf"))
pdfmetrics.registerFont(TTFont("Mono",        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"))

# ---------------------------------------------------------------- palette
INK    = HexColor("#0B1524")
NAVY   = HexColor("#101C36")
SLATE  = HexColor("#3F4C63")
MUTED  = HexColor("#6B7A93")
FAINT  = HexColor("#93A1B7")
LINE   = HexColor("#E3E8F0")
SOFT   = HexColor("#F4F6FB")
SOFT2  = HexColor("#EDF1F9")
WHITE  = HexColor("#FFFFFF")

INDIGO = HexColor("#4F46E5")
VIOLET = HexColor("#7C3AED")
TEAL   = HexColor("#0D9488")
SKY    = HexColor("#0284C7")
AMBER  = HexColor("#D97706")
ROSE   = HexColor("#E11D48")
GREEN  = HexColor("#059669")
GOLD   = HexColor("#B45309")

def tint(c, f=0.10):
    return Color(1 - (1 - c.red) * f, 1 - (1 - c.green) * f, 1 - (1 - c.blue) * f)

# ---------------------------------------------------------------- text utils
def sw(text, font, size):
    return pdfmetrics.stringWidth(text, font, size)

def wrap(text, font, size, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if sw(t, font, size) <= width or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def par(c, x, y, w, text, font="SS", size=9.5, leading=None, color=SLATE):
    leading = leading or size * 1.42
    c.setFont(font, size); c.setFillColor(color)
    for ln in wrap(text, font, size, w):
        c.drawString(x, y, ln); y -= leading
    return y

def par_h(text, font, size, w, leading=None):
    leading = leading or size * 1.42
    return len(wrap(text, font, size, w)) * leading

def rrect(c, x, y, w, h, r=8, fill=None, stroke=None, sw_=0.8):
    if fill:   c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(sw_)
    c.roundRect(x, y, w, h, r, fill=1 if fill else 0, stroke=1 if stroke else 0)

def chip(c, x, y, text, fg, bg, size=7.2, pad=5.5, font="SS-Semi", h=13):
    w = sw(text.upper(), font, size) + 2 * pad
    rrect(c, x, y, w, h, h / 2, fill=bg)
    c.setFont(font, size); c.setFillColor(fg)
    c.drawString(x + pad, y + (h - size) / 2 + 0.8, text.upper())
    return w

def numbadge(c, cx, cy, n, col, r=9, fg=WHITE, font="SS-Bold", size=9.5):
    c.setFillColor(col); c.circle(cx, cy, r, fill=1, stroke=0)
    c.setFont(font, size); c.setFillColor(fg)
    c.drawCentredString(cx, cy - size * 0.36, str(n))

def vcheck(c, cx, cy, col=GREEN, s=3.4, lw=1.6):
    c.setStrokeColor(col); c.setLineWidth(lw); c.setLineCap(1)
    p = c.beginPath()
    p.moveTo(cx - s, cy); p.lineTo(cx - s * 0.25, cy - s * 0.8); p.lineTo(cx + s, cy + s * 0.7)
    c.drawPath(p)

def vcross(c, cx, cy, col=ROSE, s=3.2, lw=1.6):
    c.setStrokeColor(col); c.setLineWidth(lw); c.setLineCap(1)
    c.line(cx - s, cy - s, cx + s, cy + s); c.line(cx - s, cy + s, cx + s, cy - s)

def arrow_r(c, x, y, col=FAINT, s=4):
    c.setStrokeColor(col); c.setLineWidth(1.4); c.setLineCap(1)
    c.line(x - s, y + s, x, y); c.line(x - s, y - s, x, y)

def dotgrid(c, x0, y0, w, h, gap=14, col=None, r=0.7):
    col = col or Color(1, 1, 1, alpha=0.06)
    c.setFillColor(col)
    yy = y0
    while yy < y0 + h:
        xx = x0
        while xx < x0 + w:
            c.circle(xx, yy, r, fill=1, stroke=0)
            xx += gap
        yy += gap

# ---------------------------------------------------------------- page furniture
PAGENO = [0]
def footer(c, section):
    PAGENO[0] += 1
    n = PAGENO[0]
    c.setStrokeColor(LINE); c.setLineWidth(0.7)
    c.line(M, 40, PW - M, 40)
    c.setFont("SS-Semi", 7); c.setFillColor(FAINT)
    c.drawString(M, 29, "IRIS  ·  USER GUIDE")
    c.setFont("SS", 7)
    c.drawCentredString(PW / 2, 29, section.upper())
    c.setFont("SS-Semi", 7.6); c.setFillColor(MUTED)
    c.drawRightString(PW - M, 29, f"{n:02d}")

def header(c, eyebrow, title, sub=None, accent=INDIGO):
    y = PH - 64
    c.setFillColor(accent)
    c.rect(M, y + 2, 22, 3.2, fill=1, stroke=0)
    c.setFont("SS-Bold", 8.2); c.setFillColor(accent)
    c.drawString(M + 30, y, eyebrow.upper())
    y -= 26
    c.setFont("SS-Black", 22); c.setFillColor(INK)
    c.drawString(M, y, title)
    y -= 16
    if sub:
        y = par(c, M, y, CW, sub, "SS", 10.2, 14.6, MUTED)
        y -= 4
    return y - 2

def section_label(c, x, y, text, col=INK, size=11.5):
    c.setFont("SS-Bold", size); c.setFillColor(col)
    c.drawString(x, y, text)
    return y - size * 1.5

# ================================================================ COVER
def cover(c):
    c.setFillColor(INK); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    # layered glows
    for cx, cy, r, col, a in [
        (PW * 0.82, PH * 0.86, 320, INDIGO, 0.30),
        (PW * 0.12, PH * 0.18, 280, VIOLET, 0.22),
        (PW * 0.9,  PH * 0.12, 210, TEAL,   0.14),
    ]:
        steps = 36
        for i in range(steps, 0, -1):
            c.setFillColor(Color(col.red, col.green, col.blue, alpha=a * 3.2 / steps))
            c.circle(cx, cy, r * i / steps, fill=1, stroke=0)
    dotgrid(c, 30, 30, PW - 60, PH - 60, gap=26)
    # concentric ring motif (iris)
    cx, cy = PW - 128, PH - 148
    for r, a in [(64, 0.5), (48, 0.7), (33, 0.9)]:
        c.setStrokeColor(Color(0.62, 0.6, 1, alpha=a * 0.55)); c.setLineWidth(1.1)
        c.circle(cx, cy, r, fill=0, stroke=1)
    c.setFillColor(Color(0.55, 0.52, 1, alpha=0.95)); c.circle(cx, cy, 15, fill=1, stroke=0)
    c.setFillColor(INK); c.circle(cx - 4, cy + 4, 4.2, fill=1, stroke=0)

    # eyebrow
    y = PH - 320
    c.setFont("SS-Bold", 10.5); c.setFillColor(HexColor("#8B93FF"))
    c.drawString(M + 4, y + 176, "P H Y S I Q U E   5 7   I N D I A")
    # wordmark
    c.setFont("SS-Black", 96); c.setFillColor(WHITE)
    c.drawString(M, y + 64, "IRIS")
    c.setFont("SS-Light", 27); c.setFillColor(HexColor("#C7CDE6"))
    c.drawString(M + 4, y + 26, "The studio support workspace.")
    y = par(c, M + 4, y - 12, 400,
            "A complete guide to raising tickets, tracking resolutions, reviewing "
            "classes and keeping every studio running beautifully — written for the "
            "people who use IRIS every day.",
            "SS", 11.5, 17, HexColor("#8E99B8"))
    # chips
    yy = y - 26
    xx = M + 4
    for t, col in [("USER GUIDE", INDIGO), ("EDITION 1.0", TEAL), ("SEPTEMBER 2026", VIOLET)]:
        w = sw(t, "SS-Semi", 7.6) + 18
        rrect(c, xx, yy, w, 17, 8.5, fill=Color(1, 1, 1, alpha=0.07), stroke=Color(col.red, col.green, col.blue, alpha=0.8), sw_=0.9)
        c.setFont("SS-Semi", 7.6); c.setFillColor(HexColor("#DDE2F5"))
        c.drawString(xx + 9, yy + 5.2, t)
        xx += w + 8

    # mid-page feature cards
    fy = 250
    feats = [
        ("Guided intake", "Every ticket starts from the right questions — filed in minutes."),
        ("Automatic routing", "Category and priority send it to the right team, every time."),
        ("Live visibility", "Radar, dashboards and reports keep nothing out of sight."),
    ]
    fcw = (PW - 2 * M - 2 * 14) / 3
    for i, (t, d) in enumerate(feats):
        fx = M + i * (fcw + 14)
        rrect(c, fx, fy, fcw, 86, 10, fill=Color(1, 1, 1, alpha=0.045), stroke=Color(1, 1, 1, alpha=0.14), sw_=0.9)
        c.setFillColor(HexColor("#8B93FF")); c.circle(fx + 17, fy + 66, 2.6, fill=1, stroke=0)
        c.setFont("SS-Bold", 10.5); c.setFillColor(WHITE)
        c.drawString(fx + 26, fy + 62.5, t)
        par(c, fx + 14, fy + 44, fcw - 28, d, "SS", 8.4, 11.6, HexColor("#9AA5C4"))

    # bottom band — studios
    c.setStrokeColor(Color(1, 1, 1, alpha=0.14)); c.setLineWidth(0.8)
    c.line(M, 118, PW - M, 118)
    c.setFont("SS-Bold", 7.4); c.setFillColor(HexColor("#7E88A8"))
    c.drawString(M, 102, "SERVING EVERY STUDIO")
    studios = "Kwality House · Kemps Corner     Supreme HQ · Bandra     Kenkere House · Bengaluru     Courtside · Mumbai     Copper & Cloves · Bengaluru"
    c.setFont("SS", 8.6); c.setFillColor(HexColor("#A8B1CC"))
    c.drawString(M, 86, studios)
    c.setFont("SS", 7.6); c.setFillColor(HexColor("#5D6785"))
    c.drawString(M, 58, "Internal training material · Please do not redistribute outside the Physique 57 India team.")
    c.showPage()

# ================================================================ CONTENTS / WELCOME
def contents(c):
    y = header(c, "Welcome", "One workspace for everything support.",
               "IRIS is the Physique 57 India support hub: every member concern, studio issue, class note and "
               "trainer review lives here as a ticket — filed in minutes, routed to the right team automatically, "
               "and tracked until it is genuinely resolved.")
    # three value cards
    cards = [
        ("File it fast", "Guided forms ask only what the ticket actually needs — most take under two minutes.", INDIGO),
        ("Routed for you", "Category and priority decide the owning department and response target. No guesswork.", TEAL),
        ("Nothing slips", "Statuses, deadlines and dashboards keep every open item visible until it is closed.", VIOLET),
    ]
    ch = 94; cw3 = (CW - 24) / 3
    yy = y - ch
    for i, (t, d, col) in enumerate(cards):
        x = M + i * (cw3 + 12)
        rrect(c, x, yy, cw3, ch, 10, fill=SOFT, stroke=LINE)
        c.setFillColor(col); rrect(c, x, yy + ch - 4, cw3, 4, 2, fill=col)
        c.setFont("SS-Bold", 11); c.setFillColor(INK)
        c.drawString(x + 13, yy + ch - 26, t)
        par(c, x + 13, yy + ch - 44, cw3 - 26, d, "SS", 9.2, 13, SLATE)
    y = yy - 34

    y = section_label(c, M, y, "What's inside")
    toc = [
        ("01", "Getting started", "Signing in, your profile, and how access works", "03"),
        ("02", "The workspace at a glance", "Every section of the app and what it is for", "04"),
        ("03", "Raising a ticket", "The guided intake flow, step by step", "05"),
        ("04", "Intake power tools", "Class desk, linking, write-up and shortcuts", "06"),
        ("05", "Categories & routing", "Where each kind of ticket goes, and why", "07"),
        ("06", "The ticket lifecycle", "Statuses, priorities and response targets", "08"),
        ("07", "Working with tickets", "Views, filters, saved views and exports", "09"),
        ("08", "Ownership & resolutions", "Assignment, private resolutions and edits", "10"),
        ("09", "Templates, forms & trainer reviews", "Structured feedback and assessments", "11"),
        ("10", "Dashboards, radar & reports", "Seeing the bigger picture", "12"),
        ("11", "Equipment & Momence", "The register and your studio data, connected", "13"),
        ("12", "Best practices", "Habits that make tickets genuinely useful", "14"),
        ("13", "FAQ & troubleshooting", "Quick answers to common questions", "15"),
        ("14", "Glossary", "The words IRIS uses, in plain language", "16"),
    ]
    rowh = 30
    yy = y - 6
    for i, (n, t, d, p) in enumerate(toc):
        ry = yy - rowh
        if i % 2 == 0:
            rrect(c, M, ry + 3, CW, rowh - 2, 6, fill=SOFT)
        c.setFont("SS-Bold", 9); c.setFillColor(INDIGO)
        c.drawString(M + 12, ry + 12.5, n)
        c.setFont("SS-Semi", 10); c.setFillColor(INK)
        c.drawString(M + 40, ry + 12.5, t)
        c.setFont("SS", 8.4); c.setFillColor(MUTED)
        c.drawString(M + 218, ry + 12.5, d)
        c.setFont("SS-Bold", 9); c.setFillColor(MUTED)
        c.drawRightString(PW - M - 12, ry + 12.5, p)
        yy = ry
    footer(c, "Welcome & contents")
    c.showPage()

# ================================================================ 01 GETTING STARTED
def getting_started(c):
    y = header(c, "Section 01", "Getting started",
               "Access is managed by your workspace administrators — there is nothing to install. "
               "You sign in with your work Google account or your work email, in any modern browser.")

    y = section_label(c, M, y - 4, "Signing in — four quick steps")
    # 4-step horizontal process
    stw = (CW - 3 * 18) / 4; sth = 110
    steps = [
        ("Open IRIS", "Go to your studio's IRIS address in any modern browser, on desktop or mobile."),
        ("Sign in", "Use “Continue with Google” with your work account, or your work email and password."),
        ("Confirm email", "First time with email? Click the confirmation link sent to your inbox, then sign in."),
        ("You're in", "The Overview dashboard opens. Your name and role appear in the top-right menu."),
    ]
    yy = y - sth - 8
    for i, (t, d) in enumerate(steps):
        x = M + i * (stw + 18)
        rrect(c, x, yy, stw, sth, 10, fill=WHITE, stroke=LINE, sw_=1)
        numbadge(c, x + 16, yy + sth - 17, i + 1, INDIGO)
        c.setFont("SS-Bold", 9.6); c.setFillColor(INK)
        c.drawString(x + 30, yy + sth - 20.5, t)
        par(c, x + 12, yy + sth - 40, stw - 22, d, "SS", 8.4, 11.8, SLATE)
        if i < 3:
            arrow_r(c, x + stw + 13.5, yy + sth / 2, INDIGO, 3.6)
    y = yy - 30

    y = section_label(c, M, y, "Two roles, one workspace")
    colw = (CW - 16) / 2; colh = 168
    yy = y - colh - 4
    roles = [
        ("AGENT", "Every team member", INDIGO, [
            "Raise tickets for members, classes, equipment and studio issues",
            "Track, comment on and update the tickets they can see",
            "Resolve tickets assigned to them, with a private resolution note",
            "Use dashboards, reports, the radar and the template library",
        ]),
        ("ADMINISTRATOR", "Workspace managers", VIOLET, [
            "Everything an agent can do, across the whole workspace",
            "Manage accounts, teams and studios under People & teams",
            "Configure Settings, Integrations and Trainer reviews",
            "Import history, manage templates and automation",
        ]),
    ]
    for i, (tag, subt, col, items) in enumerate(roles):
        x = M + i * (colw + 16)
        rrect(c, x, yy, colw, colh, 10, fill=SOFT, stroke=LINE)
        chip(c, x + 14, yy + colh - 26, tag, WHITE, col)
        c.setFont("SS-It", 8.6); c.setFillColor(MUTED)
        c.drawRightString(x + colw - 14, yy + colh - 22, subt)
        ly = yy + colh - 48
        for it in items:
            vcheck(c, x + 20, ly + 3, col, 3)
            ly = par(c, x + 32, ly, colw - 48, it, "SS", 9.0, 12.4, SLATE) - 4.5
    y = yy - 26

    y = section_label(c, M, y, "Your profile")
    y = par(c, M, y, CW,
            "Open the account menu (top right) → Profile to check your linked staff record, department and home "
            "studio, and to switch between light and dark themes. Use Change password from the same menu whenever "
            "you need a new one. If anything about your profile looks wrong — the wrong studio, the wrong team — "
            "ask an administrator to correct it in People & teams; you cannot edit those fields yourself.",
            "SS", 9.6, 14, SLATE)
    # tip bar
    yy = y - 40
    rrect(c, M, yy, CW, 32, 8, fill=tint(TEAL, 0.10), stroke=tint(TEAL, 0.5))
    chip(c, M + 12, yy + 9.5, "TIP", WHITE, TEAL)
    par(c, M + 52, yy + 20, CW - 66,
        "Locked items in the left navigation (with a small lock) are administrator areas. Everything else is yours to use.",
        "SS", 8.8, 12, HexColor("#0F5F58"))
    footer(c, "Getting started")
    c.showPage()

# ================================================================ 02 WORKSPACE MAP
def workspace_map(c):
    y = header(c, "Section 02", "The workspace at a glance",
               "Everything lives in the left navigation rail. Collapse it any time — icons keep their tooltips — "
               "and press the search in the top bar to jump straight to any section.")
    items = [
        ("Overview",         "Your daily start point: live counts, response-time pulse and the day's priorities.", INDIGO, False),
        ("IRIS assistant",   "Raise a new ticket through the guided intake flow — the heart of the app.", INDIGO, False),
        ("Radar",            "A live operations radar per studio: what is open, ageing or breaching right now.", INDIGO, False),
        ("All tickets",      "Every ticket in list, board or card view, with filters, saved views and exports.", INDIGO, False),
        ("Equipment",        "The equipment register: machines, parts and repair history across studios.", TEAL, False),
        ("Template library", "Guided templates that start a ticket with the right questions already asked.", TEAL, False),
        ("Reports library",  "Ready-made report types over live data, exportable in multiple formats.", TEAL, False),
        ("Trend dashboard",  "Analytics over time: volumes, categories, studios and conversation themes.", TEAL, False),
        ("Trainer reviews",  "Consolidated trainer performance reports from reviews and assessments.", VIOLET, True),
        ("Evaluation forms", "Embedded evaluation and feedback forms, filled in where the work happens.", VIOLET, False),
        ("Momence",          "Your studio platform data — members, sessions, rosters — viewed inside IRIS.", VIOLET, False),
        ("People & teams",   "Accounts, roles, departments and studios for the whole workspace.", ROSE, True),
        ("Integrations",     "Connections to email, automation and studio tools, with delivery logs.", ROSE, True),
        ("Settings",         "Workspace configuration: taxonomy, response targets, templates and history.", ROSE, True),
    ]
    cw2 = (CW - 14) / 2; ch = 66
    yy = y - 8
    for i, (name, desc, col, admin) in enumerate(items):
        r, cidx = divmod(i, 2)
        x = M + cidx * (cw2 + 14)
        cy = yy - ch - r * (ch + 13)
        rrect(c, x, cy, cw2, ch, 9, fill=WHITE, stroke=LINE, sw_=1)
        c.setFillColor(col); rrect(c, x, cy + 8, 3.5, ch - 16, 1.75, fill=col)
        c.setFont("SS-Bold", 10); c.setFillColor(INK)
        c.drawString(x + 14, cy + ch - 21, name)
        if admin:
            chip(c, x + 14 + sw(name, "SS-Bold", 10) + 8, cy + ch - 24.5, "ADMIN", WHITE, ROSE, 6.2, 4.5, "SS-Bold", 11)
        par(c, x + 14, cy + ch - 36, cw2 - 26, desc, "SS", 8.7, 11.8, SLATE)
    footer(c, "The workspace at a glance")
    c.showPage()

# ================================================================ 03 RAISING A TICKET
def raising(c):
    y = header(c, "Section 03", "Raising a ticket",
               "Open IRIS assistant in the navigation. The intake is a short, guided form: it asks only the "
               "questions your chosen sub-category needs, reads the ticket back to you, and files it — routed, "
               "prioritised and time-stamped automatically.")

    # 5-step vertical pipeline
    steps = [
        ("Pick a category", INDIGO,
         "Start with what the ticket is about — Scheduling, Class Experience, Repair & Maintenance, "
         "Pricing & Memberships and more. Each category shows only its own sub-categories."),
        ("Pick a sub-category", INDIGO,
         "The sub-category decides the exact questions on the form, the owning department, and the ticket's "
         "default priority. Choose the closest match — you can say more in the description."),
        ("Answer the questions", VIOLET,
         "Required fields are marked; conditional questions appear only when an earlier answer makes them "
         "relevant. Filing about a member or a class? Link the real record instead of typing a name."),
        ("Review the draft", VIOLET,
         "IRIS reads the ticket back: summary, details, routing, priority and response target. Fix anything "
         "before it is filed — nothing goes in until you confirm."),
        ("File it", TEAL,
         "One tap files the ticket. It appears instantly in All tickets with its reference, status and owner — "
         "and the assigned team is notified where the workspace has that switched on."),
    ]
    sh = 94; gap = 14
    yy = y - 6
    railx = M + 16
    for i, (t, col, d) in enumerate(steps):
        cy = yy - sh - i * (sh + gap)
        # connector
        if i < len(steps) - 1:
            c.setStrokeColor(LINE); c.setLineWidth(2)
            c.line(railx, cy, railx, cy - gap)
        rrect(c, M + 38, cy, CW - 38, sh, 10, fill=SOFT if i % 2 == 0 else WHITE, stroke=LINE)
        numbadge(c, railx, cy + sh / 2, i + 1, col, 11, size=10.5)
        c.setFont("SS-Bold", 11.5); c.setFillColor(INK)
        c.drawString(M + 56, cy + sh - 25, t)
        par(c, M + 56, cy + sh - 42, CW - 56 - 38, d, "SS", 9.3, 13, SLATE)
    y = yy - 5 * (sh + gap) - 16

    rrect(c, M, y - 30, CW, 34, 8, fill=tint(INDIGO, 0.08), stroke=tint(INDIGO, 0.45))
    chip(c, M + 12, y - 20, "GOOD TO KNOW", WHITE, INDIGO)
    par(c, M + 105, y - 8.5, CW - 120,
        "Filing the same thing twice by accident is handled for you — identical submissions are de-duplicated, "
        "so a double-tap never creates two tickets.",
        "SS", 8.6, 11.6, HexColor("#33308F"))
    footer(c, "Raising a ticket")
    c.showPage()

# ================================================================ 04 POWER TOOLS
def power_tools(c):
    y = header(c, "Section 04", "Intake power tools",
               "Four features turn a good ticket into a great one. They are all on the same intake screen — "
               "learn them once and every ticket gets faster and more accurate.")
    cw2 = (CW - 16) / 2; ch = 164
    feats = [
        ("Start from a class", TEAL,
         "Something happened in a session? Tap “Start from a class” and pick the session. IRIS pulls the "
         "format, coach, start time, roll call and capacity straight from Momence and builds the ticket around "
         "the class — nothing typed, nothing misspelt.",
         "Best for: class experience, instructor punctuality, hosted classes, anything session-specific."),
        ("Link, don't type", INDIGO,
         "When a ticket concerns a member or a class, the form asks you to link the actual record via search. "
         "Linked records carry their real details with them, so the owning team never has to guess who or "
         "which session you meant.",
         "Best for: every member-related ticket. A typed name is accepted only when you're not signed in, and it is labelled as typed."),
        ("Required only", VIOLET,
         "In a hurry at the front desk? Flip the “Required only” switch and the form hides every optional "
         "question, leaving just the fields the ticket cannot file without. Flip it back any time to add "
         "richer detail.",
         "Best for: busy hours. File the essentials now; edit the ticket with more detail later."),
        ("Write it up from the answers", AMBER,
         "One tap composes a clean summary paragraph from the answers already on the form. It is completely "
         "deterministic — it phrases what you answered and never invents anything you didn't say.",
         "Best for: consistent, readable summaries without writer's block. Review it, tweak it, file it."),
    ]
    for i, (t, col, d, note) in enumerate(feats):
        r, ci = divmod(i, 2)
        x = M + ci * (cw2 + 16)
        cy = y - ch - r * (ch + 18)
        rrect(c, x, cy, cw2, ch, 11, fill=WHITE, stroke=LINE, sw_=1.1)
        rrect(c, x, cy + ch - 5, cw2, 5, 2.5, fill=col)
        c.setFont("SS-Bold", 11.5); c.setFillColor(INK)
        c.drawString(x + 15, cy + ch - 28, t)
        ny = par(c, x + 15, cy + ch - 45, cw2 - 30, d, "SS", 8.8, 12.4, SLATE)
        # note strip
        rrect(c, x + 10, cy + 9, cw2 - 20, 34, 6, fill=tint(col, 0.09))
        par(c, x + 17, cy + 33, cw2 - 34, note, "SS-It", 7.6, 9.8, Color(col.red*0.7, col.green*0.7, col.blue*0.7))
    y = y - 2 * (ch + 18) - 14

    y = section_label(c, M, y, "Shortcuts worth bookmarking")
    rows = [
        ("/iris", "Opens the guided intake, ready to file."),
        ("/iris?desk=class", "Opens the class desk directly — pick a session and go."),
        ("/iris?category=…&subcategory=…", "Deep-links straight into a specific form."),
        ("Legacy chat switch", "Prefer a conversation? The previous chat-style intake is one switch away."),
    ]
    yy = y - 6
    for code, d in rows:
        yy -= 21
        rrect(c, M, yy - 4.5, 216, 17, 4, fill=SOFT2)
        c.setFont("Mono", 7.6); c.setFillColor(HexColor("#3B3F8F"))
        c.drawString(M + 7, yy, code)
        par(c, M + 228, yy, CW - 232, d, "SS", 8.8, 11.6, SLATE)
    footer(c, "Intake power tools")
    c.showPage()

# ================================================================ 05 CATEGORIES & ROUTING
def routing(c):
    y = header(c, "Section 05", "Categories & routing",
               "Every ticket is routed by its category — deterministically, the same way every time. Pick the "
               "right category and the right team sees it within its response target. Here is the full map.")
    depts = [
        ("TRAINING",  INDIGO, ["Scheduling", "Class Experience", "Trainer Feedback"]),
        ("OPERATIONS", TEAL, ["Repair and Maintenance", "Studio Amenities and Facilities", "Operating Systems",
                              "Tech Issues", "Theft and Lost Items", "Internal Operations & Admin", "Miscellaneous"]),
        ("ACCOUNTS",  AMBER, ["Pricing and Memberships"]),
        ("SALES & CLIENT SERVICING", SKY, ["Customer Service and Communication"]),
        ("MARKETING", VIOLET, ["Brand Feedback"]),
        ("MANAGEMENT", ROSE, ["Safety and Security"]),
    ]
    yy = y - 6
    for dept, col, cats in depts:
        rows = math.ceil(len(cats) / 3)
        bh = 40 + rows * 27
        yy -= bh + 13
        rrect(c, M, yy, CW, bh, 10, fill=WHITE, stroke=LINE, sw_=1)
        c.setFillColor(col); rrect(c, M, yy + 8, 4, bh - 16, 2, fill=col)
        chip(c, M + 16, yy + bh - 27, dept, WHITE, col)
        # category pills
        px, py = M + 16, yy + bh - 58
        for cat in cats:
            wpill = sw(cat, "SS-Semi", 8.4) + 20
            if px + wpill > PW - M - 12:
                px = M + 16; py -= 27
            rrect(c, px, py, wpill, 20, 10, fill=tint(col, 0.10), stroke=tint(col, 0.45))
            c.setFont("SS-Semi", 8.4); c.setFillColor(Color(col.red*0.72, col.green*0.72, col.blue*0.72))
            c.drawString(px + 10, py + 6.4, cat)
            px += wpill + 8
    y = yy - 14
    rrect(c, M, y - 34, CW, 38, 8, fill=tint(VIOLET, 0.08), stroke=tint(VIOLET, 0.4))
    chip(c, M + 12, y - 22, "PROCESS NOTE", WHITE, VIOLET)
    par(c, M + 108, y - 9, CW - 124,
        "Not sure between two categories? Pick the one that names the outcome the member cares about — a broken "
        "shower is Studio Amenities, not Miscellaneous. Miscellaneous is a last resort, and admins review its use.",
        "SS", 8.4, 11.2, HexColor("#4C2A85"))
    footer(c, "Categories & routing")
    c.showPage()

# ================================================================ 06 LIFECYCLE
def lifecycle(c):
    y = header(c, "Section 06", "The ticket lifecycle",
               "A ticket moves through a clear pipeline from filed to closed. Statuses are how everyone — "
               "front desk, owning team, management — knows exactly where things stand.")

    y = section_label(c, M, y - 2, "The status pipeline")
    flow1 = [("New", INDIGO), ("Triaged", INDIGO), ("Assigned", VIOLET), ("In progress", VIOLET)]
    flow2 = [("Waiting on member", AMBER), ("Waiting on vendor", AMBER), ("Resolved", GREEN), ("Closed", SLATE)]
    def draw_flow(items, yy):
        x = M
        centers = []
        for i, (t, col) in enumerate(items):
            wpill = sw(t, "SS-Bold", 9.4) + 26
            rrect(c, x, yy, wpill, 24, 12, fill=tint(col, 0.12), stroke=tint(col, 0.55), sw_=1.1)
            c.setFont("SS-Bold", 9.4); c.setFillColor(Color(col.red*0.7, col.green*0.7, col.blue*0.7))
            c.drawString(x + 13, yy + 7.6, t)
            centers.append(x + wpill / 2)
            x += wpill
            if i < len(items) - 1:
                arrow_r(c, x + 15, yy + 12, FAINT, 3.4); x += 22
        return centers
    yy = y - 32
    c1 = draw_flow(flow1, yy)
    yy2 = yy - 50
    c2 = draw_flow(flow2, yy2)
    # elbow connector: bottom of last pill in row 1 → top of first pill in row 2
    gap_y = yy - 13
    c.setStrokeColor(FAINT); c.setLineWidth(1.3); c.setLineCap(1); c.setLineJoin(1)
    p = c.beginPath()
    p.moveTo(c1[-1], yy - 3)
    p.lineTo(c1[-1], gap_y)
    p.lineTo(c2[0], gap_y)
    p.lineTo(c2[0], yy2 + 29)
    c.drawPath(p)
    # arrowhead pointing down
    c.line(c2[0] - 3.4, yy2 + 33, c2[0], yy2 + 29)
    c.line(c2[0] + 3.4, yy2 + 33, c2[0], yy2 + 29)
    y = yy2 - 24
    par(c, M, y, CW,
        "Waiting statuses pause the clock story: they say the ball is with the member or an outside vendor. "
        "Resolved means the work is done and written up; Closed means it has been verified and archived.",
        "SS", 8.8, 12.2, MUTED)
    y -= 34

    # Recorded note
    rrect(c, M, y - 34, CW, 38, 8, fill=SOFT, stroke=LINE)
    chip(c, M + 12, y - 21, "RECORDED", WHITE, TEAL)
    par(c, M + 95, y - 8.5, CW - 112,
        "Compliments, qualifying positive feedback and assessments can be record-only: they are filed as "
        "“Recorded” with no deadline and no required resolution. Praise counts — it just doesn't need chasing.",
        "SS", 8.5, 11.4, SLATE)
    y -= 56

    y = section_label(c, M, y, "Priorities & first-response targets")
    y = par(c, M, y, CW,
            "Every ticket carries a priority, and every priority has a first-response target. These are the "
            "workspace defaults — administrators can tune them in Settings.",
            "SS", 9, 12.6, MUTED) - 8
    slas = [("Critical", 12, ROSE, "Safety, security, anything stopping a class"),
            ("High", 16, AMBER, "A member is blocked or a studio system is down"),
            ("Medium", 48, INDIGO, "Standard issues and requests — the default"),
            ("Low", 72, TEAL, "Nice-to-fix items, suggestions, minor niggles")]
    bmax = 72.0; bw_full = CW - 250
    for i, (t, hrs, col, d) in enumerate(slas):
        ry = y - 28 - i * 34
        c.setFont("SS-Bold", 9.6); c.setFillColor(INK)
        c.drawString(M, ry + 7, t)
        c.setFont("SS", 7.8); c.setFillColor(MUTED)
        c.drawString(M, ry - 3.5, d)
        bx = M + 208
        rrect(c, bx, ry + 1, bw_full, 13, 6.5, fill=SOFT2)
        bw = max(bw_full * hrs / bmax, 46)
        rrect(c, bx, ry + 1, bw, 13, 6.5, fill=col)
        c.setFont("SS-Bold", 8); c.setFillColor(WHITE)
        c.drawString(bx + 8, ry + 4.8, f"{hrs} h")
    y = y - 28 - 4 * 34 - 8
    rrect(c, M, y - 30, CW, 34, 8, fill=tint(ROSE, 0.07), stroke=tint(ROSE, 0.4))
    chip(c, M + 12, y - 20, "IMPORTANT", WHITE, ROSE)
    par(c, M + 92, y - 8, CW - 108,
        "Priority is set by the category and your answers — escalate honestly. Marking everything critical "
        "slows down the tickets that truly are.",
        "SS", 8.5, 11.4, HexColor("#8F1D42"))
    y -= 52
    # how the clock works
    clock = [
        ("Clock starts", INDIGO, "The moment a ticket is filed, its first-response target is stamped on it."),
        ("Countdown visible", VIOLET, "Lists and boards show time-to-target at a glance, on every ticket."),
        ("Breach surfaces", ROSE, "Anything overdue rises to the Radar and Overview until it is handled."),
    ]
    ccw = (CW - 24) / 3
    for i, (t, col, d) in enumerate(clock):
        x = M + i * (ccw + 12)
        cy = y - 74
        rrect(c, x, cy, ccw, 68, 9, fill=SOFT, stroke=LINE)
        c.setFillColor(col); c.circle(x + 15, cy + 68 - 16, 2.6, fill=1, stroke=0)
        c.setFont("SS-Bold", 9.6); c.setFillColor(INK)
        c.drawString(x + 24, cy + 68 - 19.5, t)
        par(c, x + 12, cy + 68 - 34, ccw - 24, d, "SS", 8.2, 11, SLATE)
    footer(c, "The ticket lifecycle")
    c.showPage()

# ================================================================ 07 WORKING WITH TICKETS
def working(c):
    y = header(c, "Section 07", "Working with tickets",
               "All tickets is your control room. Three views, deep filters and saved views mean the queue "
               "always looks the way your role needs it to.")
    # three views
    cw3 = (CW - 24) / 3; ch = 120
    views = [
        ("List view", INDIGO, "A dense, sortable table — best for triage, bulk scanning and export. Every column tells you status, owner, priority and time-to-target at a glance."),
        ("Board view", VIOLET, "A kanban board grouped by status (or the grouping you choose). Drag the day forward — great for teams standing in front of one screen."),
        ("Card view", TEAL, "Rich cards with summaries and badges — the most readable way to review a shortlist or walk a manager through the week."),
    ]
    for i, (t, col, d) in enumerate(views):
        x = M + i * (cw3 + 12)
        cy = y - ch
        rrect(c, x, cy, cw3, ch, 10, fill=WHITE, stroke=LINE, sw_=1)
        # mini glyph
        gx, gy = x + 13, cy + ch - 30
        c.setFillColor(tint(col, 0.25))
        if i == 0:
            for r in range(3): c.rect(gx, gy + r * 6, 26, 3.6, fill=1, stroke=0)
        elif i == 1:
            for cidx in range(3): c.rect(gx + cidx * 10, gy, 7, 16, fill=1, stroke=0)
        else:
            c.roundRect(gx, gy, 12, 16, 2, fill=1, stroke=0); c.roundRect(gx + 15, gy, 12, 16, 2, fill=1, stroke=0)
        c.setFont("SS-Bold", 10.5); c.setFillColor(INK)
        c.drawString(x + 13, cy + ch - 46, t)
        par(c, x + 13, cy + ch - 62, cw3 - 26, d, "SS", 8.3, 11.4, SLATE)
    y = y - ch - 26

    y = section_label(c, M, y, "Filters that actually filter")
    y = par(c, M, y, CW,
            "Stack filters for status, priority, category, studio, department, owner, source and date range — the "
            "active-filter summary stays visible even when the panel is collapsed, so a filtered board never looks "
            "like an empty one. Save any combination as a saved view and it is one click away tomorrow.",
            "SS", 9.2, 13, SLATE) - 10

    y = section_label(c, M, y, "Everyday actions")
    acts = [
        ("Open & read", "Click any ticket for the full record: answers, routing, linked member or class, activity and audit trail."),
        ("Update status", "Move the ticket along the pipeline as work happens — the record keeps who changed what, and when."),
        ("Edit safely", "Edits use revision checks: if a colleague saved changes while you were typing, IRIS asks you to reload rather than silently overwriting them."),
        ("Duplicate", "Same issue, different day or studio? Duplicate a ticket and adjust — faster and more consistent than retyping."),
        ("Relate tickets", "Link tickets that belong together. IRIS also suggests likely matches from the same category and sub-category."),
        ("Export CSV", "Any filtered view exports to CSV for spreadsheets, audits or vendor follow-ups."),
    ]
    cw2 = (CW - 14) / 2; rh = 60
    for i, (t, d) in enumerate(acts):
        r, ci = divmod(i, 2)
        x = M + ci * (cw2 + 14)
        cy = y - rh - r * (rh + 12)
        rrect(c, x, cy, cw2, rh, 9, fill=SOFT, stroke=LINE)
        c.setFillColor(INDIGO); c.circle(x + 15, cy + rh - 15.5, 2.4, fill=1, stroke=0)
        c.setFont("SS-Bold", 9.6); c.setFillColor(INK)
        c.drawString(x + 25, cy + rh - 20, t)
        par(c, x + 25, cy + rh - 34, cw2 - 38, d, "SS", 8.3, 11.2, SLATE)
    y = y - 3 * (rh + 12) - 10
    rrect(c, M, y - 30, CW, 34, 8, fill=tint(INDIGO, 0.08), stroke=tint(INDIGO, 0.45))
    chip(c, M + 12, y - 20, "TIP", WHITE, INDIGO)
    par(c, M + 52, y - 8.5, CW - 68,
        "The board refreshes itself — on a timer, when tickets change and when you return to the tab. "
        "No need to hammer refresh during a busy shift.",
        "SS", 8.6, 11.4, HexColor("#33308F"))
    footer(c, "Working with tickets")
    c.showPage()

# ================================================================ 08 OWNERSHIP
def ownership(c):
    y = header(c, "Section 08", "Ownership & resolutions",
               "Every ticket has exactly one accountable owner at a time. Ownership is what turns a filed "
               "ticket into a fixed problem.")
    y = section_label(c, M, y - 2, "How assignment works")
    steps = [
        ("Routed", "The category places the ticket with its owning department the moment it is filed."),
        ("Matched", "Within the department, IRIS matches an active staff member with the right studio."),
        ("Owned", "The assignee becomes the single accountable owner — visible on every view of the ticket."),
        ("Notified", "Where the workspace has assignment email switched on, the owner is emailed on creation."),
    ]
    stw = (CW - 3 * 16) / 4; sth = 104
    yy = y - sth - 6
    for i, (t, d) in enumerate(steps):
        x = M + i * (stw + 16)
        rrect(c, x, yy, stw, sth, 10, fill=WHITE, stroke=LINE, sw_=1)
        numbadge(c, x + 15, yy + sth - 16, i + 1, VIOLET, 8.5, size=8.5)
        c.setFont("SS-Bold", 9.6); c.setFillColor(INK)
        c.drawString(x + 28, yy + sth - 19.5, t)
        par(c, x + 11, yy + sth - 38, stw - 20, d, "SS", 8.2, 11.4, SLATE)
        if i < 3: arrow_r(c, x + stw + 12, yy + sth / 2, VIOLET, 3.4)
    y = yy - 28

    y = section_label(c, M, y, "Private resolutions")
    y = par(c, M, y, CW,
            "Resolutions can contain sensitive detail — a member's circumstances, a vendor negotiation, a staff "
            "conversation. So resolution notes are private by design: only the current assigned owner, signed in "
            "with their own account, can read or write the private resolution. Not colleagues, and not "
            "administrators — there is no blanket override. If ownership changes, access moves with it.",
            "SS", 9.3, 13.2, SLATE) - 8
    # two mini cards
    cw2 = (CW - 14) / 2; ch = 112
    cards = [
        ("Writing a good resolution", GREEN, [
            "Say what was actually done, not just “fixed”",
            "Note who was spoken to and what was agreed",
            "Record anything the next owner would need",
            "Resolve first, then close once verified",
        ]),
        ("What everyone else sees", SKY, [
            "Status, owner, priority and timestamps",
            "The public summary and ticket details",
            "The activity and audit trail",
            "Never the private resolution text",
        ]),
    ]
    yy = y - ch
    for i, (t, col, items) in enumerate(cards):
        x = M + i * (cw2 + 14)
        rrect(c, x, yy, cw2, ch, 10, fill=SOFT, stroke=LINE)
        c.setFont("SS-Bold", 10.2); c.setFillColor(INK)
        c.drawString(x + 14, yy + ch - 21, t)
        ly = yy + ch - 38
        for it in items:
            vcheck(c, x + 19, ly + 2.6, col, 2.8)
            ly = par(c, x + 30, ly, cw2 - 44, it, "SS", 8.8, 12.2, SLATE) - 3.4
    y = yy - 26

    y = section_label(c, M, y, "Edits, history & the audit trail")
    y = par(c, M, y, CW,
            "Everything meaningful is recorded: creation, status changes, edits, assignment changes, and "
            "relations. Edits are protected by revision checks so two people can't silently overwrite each "
            "other. If your save is rejected, reload the ticket, review the newer changes, and re-apply yours — "
            "thirty seconds that prevents lost work.",
            "SS", 9.3, 13.2, SLATE)
    yy = y - 40
    rrect(c, M, yy, CW, 34, 8, fill=tint(AMBER, 0.10), stroke=tint(AMBER, 0.45))
    chip(c, M + 12, yy + 10, "PROCESS NOTE", WHITE, AMBER)
    par(c, M + 108, yy + 22, CW - 124,
        "Going on leave? Ask an administrator to reassign your open tickets — resolution access follows the "
        "owner, so handovers should be explicit, not assumed.",
        "SS", 8.6, 11.4, HexColor("#7A4A06"))
    footer(c, "Ownership & resolutions")
    c.showPage()

# ================================================================ 09 TEMPLATES & REVIEWS
def templates(c):
    y = header(c, "Section 09", "Templates, forms & trainer reviews",
               "Structured feedback beats free text. IRIS ships guided templates, embedded evaluation forms and "
               "consolidated trainer reports so quality work is captured the same way every time.")
    cw2 = (CW - 14) / 2; ch = 142
    blocks = [
        ("Template library", INDIGO,
         "Guided templates open a structured form with the right questions already asked — category-specific "
         "fields, hosted-class feedback, weighted trainer assessments and more. Start from a template whenever "
         "one fits: it is faster than a blank form and far more consistent.",
         "Drafts save as you go — return to a half-finished template later from the same page."),
        ("Evaluation forms", TEAL,
         "The Evaluation forms section embeds the team's live evaluation and feedback forms right inside IRIS, "
         "so audits and reviews are filled in where the work happens. Administrators can add new forms to the "
         "shelf at any time.",
         "Submissions flow back into the workspace automatically — no copying results across."),
        ("Trainer reviews", VIOLET,
         "Reviews and weighted assessments consolidate into one performance report per trainer: rubric scores, "
         "trends and written feedback in a single view for the training team.",
         "An administrator area — scores and commentary are handled with care."),
        ("Hosted classes & rubrics", AMBER,
         "Purpose-built workflows cover hosted classes, instructor punctuality, late arrivals, class experience "
         "and studio environment, each with its own assessment rubric where scoring applies.",
         "Missing rubric answers are rejected rather than silently scored as zero — complete the form fully."),
    ]
    for i, (t, col, d, note) in enumerate(blocks):
        r, ci = divmod(i, 2)
        x = M + ci * (cw2 + 14)
        cy = y - ch - r * (ch + 14)
        rrect(c, x, cy, cw2, ch, 11, fill=WHITE, stroke=LINE, sw_=1.1)
        rrect(c, x, cy + ch - 5, cw2, 5, 2.5, fill=col)
        c.setFont("SS-Bold", 11); c.setFillColor(INK)
        c.drawString(x + 15, cy + ch - 27, t)
        par(c, x + 15, cy + ch - 44, cw2 - 30, d, "SS", 8.6, 12, SLATE)
        rrect(c, x + 10, cy + 9, cw2 - 20, 30, 6, fill=tint(col, 0.09))
        par(c, x + 17, cy + 28.5, cw2 - 34, note, "SS-It", 7.6, 10, Color(col.red*0.7, col.green*0.7, col.blue*0.7))
    y = y - 2 * (ch + 18) - 14

    y = section_label(c, M, y, "When to use which")
    rows = [
        ("A member complaint at the desk", "IRIS assistant — guided intake, linked member"),
        ("Feedback about a specific session", "IRIS assistant — “Start from a class”"),
        ("A recurring structured check", "Template library — pick the matching template"),
        ("A scheduled audit or evaluation", "Evaluation forms — fill the embedded form"),
        ("Reviewing a trainer's quarter", "Trainer reviews — open the consolidated report"),
    ]
    yy = y - 2
    for i, (a, b) in enumerate(rows):
        yy -= 24
        if i % 2 == 0: rrect(c, M, yy - 5.5, CW, 22, 5, fill=SOFT)
        c.setFont("SS-Semi", 8.8); c.setFillColor(INK)
        c.drawString(M + 12, yy, a)
        arrow_r(c, M + 300, yy + 3, INDIGO, 3.2)
        c.setFont("SS", 8.8); c.setFillColor(SLATE)
        c.drawString(M + 312, yy, b)
    footer(c, "Templates, forms & trainer reviews")
    c.showPage()

# ================================================================ 10 DASHBOARDS
def dashboards(c):
    y = header(c, "Section 10", "Dashboards, radar & reports",
               "Filing tickets is half the story — seeing the pattern is the other half. Four views cover "
               "the next minute, the day, the month and the deep dive.")
    cw2 = (CW - 14) / 2; ch = 156
    blocks = [
        ("Overview", INDIGO, "YOUR MORNING",
         "The landing dashboard: live open counts, response-time pulse and the day's priorities in flip-card "
         "metrics. Click a metric card to flip it and see the top studios behind the number. Start here every "
         "shift — it answers “what needs me today?” in ten seconds."),
        ("Studio ops radar", TEAL, "RIGHT NOW",
         "A live radar per studio showing what is open, what is ageing and what is at risk of breaching its "
         "response target. Switch studios at the top. If you run a floor, keep Radar open — it is designed to "
         "be glanceable from across the room."),
        ("Reports library", SKY, "THE RECORD",
         "Ready-made report types over live data — breakdowns by status, priority, studio, category, department "
         "and source — with multiple export formats for management packs, vendor reviews and audits."),
        ("Trend dashboard", VIOLET, "THE PATTERN",
         "Analytics over time: volumes, categories, studio-by-studio comparisons and the conversation themes "
         "that matter. Use it monthly to spot what keeps recurring — the ticket you prevent is the cheapest "
         "ticket of all."),
    ]
    for i, (t, col, tag, d) in enumerate(blocks):
        r, ci = divmod(i, 2)
        x = M + ci * (cw2 + 14)
        cy = y - ch - r * (ch + 16)
        rrect(c, x, cy, cw2, ch, 11, fill=SOFT if (i in (0, 3)) else WHITE, stroke=LINE, sw_=1)
        chip(c, x + 14, cy + ch - 26, tag, WHITE, col)
        c.setFont("SS-Bold", 12); c.setFillColor(INK)
        c.drawString(x + 14, cy + ch - 46, t)
        par(c, x + 14, cy + ch - 64, cw2 - 28, d, "SS", 8.7, 12.4, SLATE)
    y = y - 2 * (ch + 16) - 16

    y = section_label(c, M, y, "A weekly rhythm that works")
    rhythm = [
        ("Daily", INDIGO, "Overview at shift start; Radar on the floor; clear anything breaching today."),
        ("Weekly", TEAL, "All tickets filtered to your team; chase waiting states; close verified work."),
        ("Monthly", VIOLET, "Trend dashboard for patterns; Reports library for the management pack."),
    ]
    cw3 = (CW - 24) / 3
    for i, (t, col, d) in enumerate(rhythm):
        x = M + i * (cw3 + 12)
        cy = y - 80
        rrect(c, x, cy, cw3, 74, 9, fill=tint(col, 0.07), stroke=tint(col, 0.4))
        c.setFont("SS-Bold", 9.8); c.setFillColor(Color(col.red*0.7, col.green*0.7, col.blue*0.7))
        c.drawString(x + 12, cy + 74 - 20, t.upper())
        par(c, x + 12, cy + 74 - 35, cw3 - 24, d, "SS", 8.3, 11.4, SLATE)
    y -= 100
    rrect(c, M, y - 36, CW, 40, 8, fill=tint(TEAL, 0.09), stroke=tint(TEAL, 0.45))
    chip(c, M + 12, y - 24, "TIP", WHITE, TEAL)
    par(c, M + 52, y - 10, CW - 68,
        "Every dashboard reads the same live data as All tickets — if a number looks wrong, click through to "
        "the underlying tickets rather than second-guessing the chart. The answer is always one level down.",
        "SS", 8.6, 11.6, HexColor("#0F5F58"))
    footer(c, "Dashboards, radar & reports")
    c.showPage()

# ================================================================ 11 EQUIPMENT & MOMENCE
def equipment(c):
    y = header(c, "Section 11", "Equipment & Momence",
               "Two sections connect IRIS to the physical studio: the equipment register for the machines, and "
               "the Momence workspace for members and sessions.")

    y = section_label(c, M, y - 2, "Equipment register")
    y = par(c, M, y, CW,
            "The register tracks the fleet — bikes, machines and studio hardware — with per-item history across "
            "studios. When you raise a Repair & Maintenance ticket, reference the exact equipment so the fix and "
            "the machine's history stay connected. Over time the register shows which items fail repeatedly and "
            "when servicing is genuinely due, instead of relying on memory.",
            "SS", 9.3, 13.2, SLATE) - 6
    # equipment quick cards
    cw3 = (CW - 24) / 3
    eq = [("Log precisely", "Name the machine and the part — “bike 7, left pedal” beats “a bike is broken”.", TEAL),
          ("Check history first", "The same fault twice in a month is a different conversation with the vendor.", INDIGO),
          ("Close the loop", "When the repair is done, resolve the ticket so the register reflects reality.", VIOLET)]
    for i, (t, d, col) in enumerate(eq):
        x = M + i * (cw3 + 12)
        cy = y - 84
        rrect(c, x, cy, cw3, 78, 9, fill=SOFT, stroke=LINE)
        c.setFillColor(col); c.circle(x + 15, cy + 78 - 17, 2.6, fill=1, stroke=0)
        c.setFont("SS-Bold", 9.4); c.setFillColor(INK)
        c.drawString(x + 24, cy + 78 - 21, t)
        par(c, x + 12, cy + 78 - 37, cw3 - 24, d, "SS", 8.3, 11.2, SLATE)
    y = y - 84 - 28

    y = section_label(c, M, y, "The Momence workspace")
    y = par(c, M, y, CW,
            "Momence is the studio platform behind memberships, sessions and rosters. Inside IRIS you can look "
            "up members, browse sessions, open rosters with check-ins and drill into related records — without "
            "leaving the app or re-typing anything. The intake flow uses the same connection when you link a "
            "member or start a ticket from a class.",
            "SS", 9.3, 13.2, SLATE) - 6
    cw2 = (CW - 14) / 2
    mcards = [
        ("What you can rely on", GREEN, [
            "Live records exactly as Momence returns them",
            "Rosters, capacity, check-ins and visit history",
            "Errors and empty results shown honestly, never papered over",
        ]),
        ("What to watch for", AMBER, [
            "Demo records are clearly labelled “Demo” when no live connection is configured",
            "Demo data is never mixed into live results",
            "Changes to Momence data are admin-only and always confirmed first",
        ]),
    ]
    ch = 120
    yy = y - ch
    for i, (t, col, items) in enumerate(mcards):
        x = M + i * (cw2 + 14)
        rrect(c, x, yy, cw2, ch, 10, fill=WHITE, stroke=LINE, sw_=1)
        rrect(c, x, yy + ch - 5, cw2, 5, 2.5, fill=col)
        c.setFont("SS-Bold", 10.2); c.setFillColor(INK)
        c.drawString(x + 14, yy + ch - 26, t)
        ly = yy + ch - 43
        for it in items:
            (vcheck if i == 0 else vcheck)(c, x + 19, ly + 2.6, col, 2.8)
            ly = par(c, x + 30, ly, cw2 - 44, it, "SS", 8.7, 11.8, SLATE) - 3.5
    y = yy - 20
    rrect(c, M, y - 36, CW, 40, 8, fill=tint(GOLD, 0.09), stroke=tint(GOLD, 0.45))
    chip(c, M + 12, y - 24, "DID YOU KNOW", WHITE, GOLD)
    par(c, M + 104, y - 10, CW - 120,
        "The register knows the PowerCycle bikes down to individual parts — console, power meter, pedals, "
        "levers, flywheel — so a repair ticket that names the exact part arrives with the right tools and "
        "settings already understood.",
        "SS", 8.5, 11.4, HexColor("#6B3E05"))
    y -= 52
    rrect(c, M, y - 36, CW, 40, 8, fill=tint(SKY, 0.09), stroke=tint(SKY, 0.45))
    chip(c, M + 12, y - 24, "PRIVACY NOTE", WHITE, SKY)
    par(c, M + 104, y - 10, CW - 120,
        "Member records are personal data. Look up only what the ticket needs, keep sensitive detail in the "
        "private resolution, and never export member data outside approved workflows.",
        "SS", 8.5, 11.4, HexColor("#075985"))
    footer(c, "Equipment & Momence")
    c.showPage()

# ================================================================ 12 BEST PRACTICES
def best_practices(c):
    y = header(c, "Section 12", "Best practices",
               "The difference between a ticket system that works and one that gets ignored is habits. "
               "These are the ones that matter.")
    cw2 = (CW - 16) / 2
    dos = [
        "File it while it's fresh — same shift, same hour if you can",
        "Link the real member and the real class, every time",
        "One issue per ticket; relate tickets that belong together",
        "Write summaries a stranger could act on tomorrow",
        "Use “Write it up from the answers” for consistent summaries",
        "Update status as work happens, not at the end of the week",
        "Resolve with substance — what was done, agreed and verified",
        "Check the radar before promising a member a timeline",
    ]
    donts = [
        "Don't type a member's name when you can link the record",
        "Don't bundle three problems into one “studio issues” ticket",
        "Don't mark routine requests critical to jump the queue",
        "Don't leave tickets in “In progress” as a parking lot",
        "Don't put sensitive member detail in the public summary",
        "Don't close a ticket the member doesn't agree is fixed",
        "Don't default to Miscellaneous — a real category routes better",
        "Don't rely on WhatsApp memory — if it matters, it's a ticket",
    ]
    ch = 302
    for i, (title, col, items, mark) in enumerate([
        ("Do", GREEN, dos, "check"), ("Avoid", ROSE, donts, "cross")]):
        x = M + i * (cw2 + 16)
        cy = y - ch
        rrect(c, x, cy, cw2, ch, 12, fill=tint(col, 0.055), stroke=tint(col, 0.4), sw_=1.2)
        c.setFont("SS-Black", 15); c.setFillColor(Color(col.red*0.75, col.green*0.75, col.blue*0.75))
        c.drawString(x + 16, cy + ch - 30, title.upper())
        ly = cy + ch - 52
        for it in items:
            if mark == "check": vcheck(c, x + 22, ly + 3, col, 3.2)
            else: vcross(c, x + 22, ly + 3, col, 3)
            ly = par(c, x + 34, ly, cw2 - 50, it, "SS", 9.1, 12.4, SLATE) - 6
    y = y - ch - 22

    y = section_label(c, M, y, "The golden thread")
    y = par(c, M, y, CW,
            "Every good ticket answers three questions: What exactly happened? Who and what does it involve — "
            "linked, not typed? What does “fixed” look like? If your ticket answers all three, the owning team "
            "can act without coming back to you, and the member gets their answer a day sooner.",
            "SS", 9.8, 14.4, SLATE)
    # three question chips
    yy = y - 30
    labels = ["1 · WHAT HAPPENED?", "2 · WHO & WHAT — LINKED?", "3 · WHAT DOES FIXED LOOK LIKE?"]
    cols = [INDIGO, VIOLET, TEAL]
    x = M
    for lab, col in zip(labels, cols):
        w = sw(lab, "SS-Bold", 8.6) + 26
        rrect(c, x, yy, w, 24, 12, fill=tint(col, 0.1), stroke=tint(col, 0.5), sw_=1)
        c.setFont("SS-Bold", 8.6); c.setFillColor(Color(col.red*0.7, col.green*0.7, col.blue*0.7))
        c.drawString(x + 13, yy + 7.8, lab)
        x += w + 12
    # motto strip
    yy -= 62
    rrect(c, M, yy, CW, 46, 10, fill=INK)
    dotgrid(c, M + 8, yy + 6, CW - 16, 34, gap=15)
    c.setFont("SS-Black", 14); c.setFillColor(WHITE)
    c.drawCentredString(PW / 2, yy + 26, "If it matters, it's a ticket.")
    c.setFont("SS", 8.2); c.setFillColor(HexColor("#9AA5C4"))
    c.drawCentredString(PW / 2, yy + 12, "The one habit that makes everything else in this guide work.")
    footer(c, "Best practices")
    c.showPage()

# ================================================================ 13 FAQ
def faq(c):
    y = header(c, "Section 13", "FAQ & troubleshooting",
               "Quick answers to the questions the team actually asks.")
    qas = [
        ("I can't sign in — what do I check first?",
         "Use your work account. If you signed up with email, confirm the link sent to your inbox first. Still stuck? "
         "An administrator can check your account status in People & teams — accounts can be deactivated, which ends access immediately."),
        ("I filed a ticket with a mistake in it. Now what?",
         "Open it from All tickets and edit — the revision history keeps the original. If it was the wrong sub-category "
         "entirely, edit the ticket or duplicate it into the right form and relate the two."),
        ("Why can't I see the resolution on a ticket?",
         "Resolutions are private to the current assigned owner — by design, with no admin override. If you now own the "
         "ticket, access is yours; if you need the content of an older resolution, ask the previous owner."),
        ("The member I'm filing about isn't found in search.",
         "Check spelling and try phone or email fragments. If they're genuinely not in Momence yet, file with what you "
         "have and note it — but linked records should be the norm, not the exception."),
        ("My save was rejected — “the ticket changed”.",
         "A colleague saved changes while you were editing. Reload the ticket, review the newer version, and re-apply "
         "your edit. Nothing you can do corrupts the record — the check exists to protect both of you."),
        ("A record says “Demo” on it. Is that real?",
         "No — Demo-labelled records appear only when no live studio connection is configured, and they are never mixed "
         "into live results. If you see Demo where you expect live data, tell an administrator."),
        ("Does marking a ticket Resolved close it?",
         "Not quite. Resolved means the work is done and written up. Closed means it has been verified. Resolve when you "
         "finish; close when you (or the process) have confirmed the fix stuck."),
        ("Can I get my filtered ticket list into a spreadsheet?",
         "Yes — filter the list the way you want it and export to CSV. The reports library also has ready-made breakdowns "
         "with multiple export formats."),
    ]
    yy = y - 4
    for q, a in qas:
        qh = par_h(q, "SS-Bold", 9.8, CW - 50, 12.6)
        ah = par_h(a, "SS", 8.6, CW - 50, 11.6)
        bh = qh + ah + 22
        yy -= bh + 12
        rrect(c, M, yy, CW, bh, 9, fill=WHITE, stroke=LINE, sw_=1)
        c.setFillColor(INDIGO)
        c.setFont("SS-Black", 11)
        c.drawString(M + 14, yy + bh - 22, "Q")
        ty = par(c, M + 36, yy + bh - 21, CW - 50, q, "SS-Bold", 9.8, 12.6, INK)
        par(c, M + 36, ty - 2, CW - 50, a, "SS", 8.6, 11.6, SLATE)
    footer(c, "FAQ & troubleshooting")
    c.showPage()

# ================================================================ 14 GLOSSARY + BACK
def glossary(c):
    y = header(c, "Section 14", "Glossary",
               "The words IRIS uses, in plain language.")
    terms = [
        ("Ticket", "One tracked issue, request or piece of feedback, from filed to closed."),
        ("Category / sub-category", "What the ticket is about; decides the questions asked and the team that owns it."),
        ("Routing", "The automatic placement of a ticket with its owning department the moment it is filed."),
        ("Priority", "How urgent the ticket is — critical, high, medium or low — with a matching response target."),
        ("Response target (SLA)", "The first-response commitment attached to each priority, in hours."),
        ("Status", "Where the ticket is in its life: New → Triaged → Assigned → In progress → … → Closed."),
        ("Record-only / Recorded", "A ticket filed for the record — praise, assessments — with no deadline to chase."),
        ("Owner / assignee", "The one person currently accountable for a ticket, matched by department and studio."),
        ("Private resolution", "The owner-only write-up of what was actually done; not visible to anyone else."),
        ("Linked record", "A real member or class attached from Momence, instead of a typed name."),
        ("Class desk", "The “start from a class” intake: pick a session and the ticket builds itself around it."),
        ("Saved view", "A stored filter combination on All tickets — your queue, one click away."),
        ("Revision check", "The safeguard that stops two people silently overwriting each other's edits."),
        ("Audit trail", "The permanent record of who changed what on a ticket, and when."),
        ("Momence", "The studio platform behind members, sessions, rosters and memberships."),
        ("Demo record", "A labelled sample shown only when no live connection exists; never mixed with live data."),
    ]
    rh = 27.5
    yy = y - 2
    for i, (t, d) in enumerate(terms):
        ry = yy - rh
        if i % 2 == 0: rrect(c, M, ry + 2.5, CW, rh - 1, 5, fill=SOFT)
        c.setFont("SS-Bold", 8.9); c.setFillColor(INK)
        c.drawString(M + 12, ry + 10.6, t)
        c.setFont("SS", 8.5); c.setFillColor(SLATE)
        c.drawString(M + 168, ry + 10.6, d)
        yy = ry
    y = yy - 22

    # support strip
    rrect(c, M, y - 58, CW, 58, 10, fill=INK)
    dotgrid(c, M + 8, y - 52, CW - 16, 46, gap=16)
    c.setFont("SS-Bold", 11.5); c.setFillColor(WHITE)
    c.drawString(M + 18, y - 24, "Need help beyond this guide?")
    par(c, M + 18, y - 39, CW - 200,
        "Ask your studio's workspace administrator — they can fix accounts, adjust routing and answer anything this guide doesn't.",
        "SS", 8.4, 11, HexColor("#9AA5C4"))
    c.setFont("SS-Black", 15); c.setFillColor(HexColor("#8B93FF"))
    c.drawRightString(PW - M - 18, y - 36, "IRIS")
    footer(c, "Glossary")
    c.showPage()

# ================================================================ build
def main():
    out = "/home/user/iris-ai-v2/docs/user-guide/IRIS-User-Guide.pdf"
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle("IRIS User Guide — Physique 57 India")
    c.setAuthor("Physique 57 India")
    c.setSubject("How to use the IRIS studio support workspace")
    cover(c)
    contents(c)
    getting_started(c)
    workspace_map(c)
    raising(c)
    power_tools(c)
    routing(c)
    lifecycle(c)
    working(c)
    ownership(c)
    templates(c)
    dashboards(c)
    equipment(c)
    best_practices(c)
    faq(c)
    glossary(c)
    c.save()
    print("wrote", out)

if __name__ == "__main__":
    main()
