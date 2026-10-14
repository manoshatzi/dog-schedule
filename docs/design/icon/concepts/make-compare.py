"""Generate Dog Schedule icon concept SVGs + comparison sheet.
Usage: python3 -I gen.py <repo_root> <scratch_dir>
"""
import base64, math, os, subprocess, sys

ROOT, SCR = sys.argv[1], sys.argv[2]
CONCEPTS = os.path.join(ROOT, "docs/design/icon/concepts")
G, DG, C, O = "#2F6B4F", "#1F4A36", "#F4F5F1", "#D9822B"


def toe(cx, cy, rx, ry, rot, fill):
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'transform="rotate({rot} {cx} {cy})" fill="{fill}"/>')


# ---------- Concept A: paw whose main pad is a check mark ----------
def mark_a(fg=C, accent=None, mono=False):
    t = "".join([
        toe(292, 384, 62, 80, -27, fg),
        toe(426, 262, 66, 86, -9, fg),
        toe(602, 262, 66, 86, 9, fg),
        toe(736, 384, 62, 80, 27, fg),
    ])
    chk = (f'<path d="M386 636 L486 736 L662 560" fill="none" stroke="{fg}" '
           f'stroke-width="128" stroke-linecap="round" stroke-linejoin="round"/>')
    return t + chk


# ---------- Concept B: paw inside a day ring (orange = still open) ----------
def arc(r, a0, a1):
    def p(a):
        rad = math.radians(a - 90)
        return 512 + r * math.cos(rad), 512 + r * math.sin(rad)
    x0, y0 = p(a0); x1, y1 = p(a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{x0:.1f} {y0:.1f} A{r} {r} 0 {large} 1 {x1:.1f} {y1:.1f}"


def mark_b(fg=C, accent=O, mono=False):
    acc = fg if mono else accent
    ring = (f'<path d="{arc(292, 14, 256)}" fill="none" stroke="{fg}" stroke-width="84" stroke-linecap="round"/>'
            f'<path d="{arc(292, 290, 340)}" fill="none" stroke="{acc}" stroke-width="84" stroke-linecap="round"/>')
    paw = "".join([
        toe(392, 470, 40, 52, -24, fg),
        toe(466, 392, 42, 55, -8, fg),
        toe(558, 392, 42, 55, 8, fg),
        toe(632, 470, 40, 52, 24, fg),
        f'<path d="M512 512 C568 512 640 590 640 642 C640 690 600 700 560 690 '
        f'C536 684 524 680 512 680 C500 680 488 684 464 690 C424 700 384 690 384 642 '
        f'C384 590 456 512 512 512 Z" fill="{fg}"/>',
    ])
    return ring + paw


# ---------- Concept C: dog head with a "done" check badge ----------
def mark_c(fg=C, accent=O, mono=False):
    acc = fg if mono else accent
    head = ('<path d="M512 250 C640 250 712 330 712 450 L712 560 C712 690 624 790 512 790 '
            'C400 790 312 690 312 560 L312 450 C312 330 384 250 512 250 Z"/>')
    ear_l = ('<path d="M352 282 C282 258 196 300 182 420 C170 530 206 610 262 618 '
             'C312 626 330 560 340 470 Z"/>')
    ear_r = ear_l.replace('d="', 'transform="translate(1024 0) scale(-1 1)" d="')
    cut = ('<circle cx="446" cy="488" r="34" fill="black"/>'
           '<circle cx="578" cy="488" r="34" fill="black"/>'
           '<path d="M470 594 C470 570 554 570 554 594 C554 624 528 646 512 646 C496 646 470 624 470 594 Z" fill="black"/>'
           '<circle cx="704" cy="704" r="150" fill="black"/>')
    mask = (f'<mask id="mc" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
            f'<rect width="1024" height="1024" fill="white"/>{cut}</mask>')
    badge = (f'<circle cx="704" cy="704" r="118" fill="{acc}"/>'
             + ('' if mono else
                f'<path d="M648 706 L688 746 L762 672" fill="none" stroke="{fg}" stroke-width="40" '
                f'stroke-linecap="round" stroke-linejoin="round"/>'))
    if mono:  # check knocked out of the badge
        mask2 = ('<mask id="mb" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
                 '<rect width="1024" height="1024" fill="white"/>'
                 '<path d="M648 706 L688 746 L762 672" fill="none" stroke="black" stroke-width="40" '
                 'stroke-linecap="round" stroke-linejoin="round"/></mask>')
        badge = mask2 + f'<circle cx="704" cy="704" r="118" fill="{acc}" mask="url(#mb)"/>'
    return mask + f'<g fill="{fg}" mask="url(#mc)">{ear_l}{ear_r}{head}</g>' + badge


MARKS = {"a": mark_a, "b": mark_b, "c": mark_c}


def svg(inner, bg=None, scale=1.0):
    bgrect = f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ""
    g = inner if scale == 1.0 else (
        f'<g transform="translate(512 512) scale({scale}) translate(-512 -512)">{inner}</g>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
            f'{bgrect}{g}</svg>\n')


def write(path, text):
    with open(path, "w") as f:
        f.write(text)


def render(src, out, w):
    subprocess.run(["rsvg-convert", "-w", str(w), "-h", str(w), src, "-o", out], check=True)


def magick(*args):
    subprocess.run(["magick", *args], check=True)


def b64(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


RATIONALE = {
    "a": "Paw-check: the paw's main pad IS a bold check mark, so the mark reads as 'dog task, done'.",
    "b": "Day ring: a paw inside a ring of the day; the orange gap is the part still open.",
    "c": "Dog head + badge: a friendly floppy-eared face with an orange 'done' check badge.",
}

# Android: mark must stay inside the 66dp safe circle of the 108dp canvas.
ANDROID_SCALE = {"a": 0.88, "b": 0.92, "c": 0.80}
ICON_SCALE = {"a": 0.94, "b": 1.0, "c": 0.94}

if __name__ == "__main__":
    os.makedirs(SCR, exist_ok=True)
    cells = []
    for k, fn in MARKS.items():
        full = os.path.join(CONCEPTS, f"concept-{k}.svg")
        write(full, f"<!-- {RATIONALE[k]} -->\n" + svg(fn(), G, ICON_SCALE[k]))
        write(os.path.join(SCR, f"{k}-fg-android.svg"), svg(fn(), None, ANDROID_SCALE[k]))
        render(full, f"{SCR}/{k}-1024.png", 1024)
        for s in (180, 60, 29):
            render(full, f"{SCR}/{k}-{s}.png", s)
            # iOS-style rounded square mask (~22.4% radius)
            r = round(s * 0.2237)
            magick(f"{SCR}/{k}-{s}.png", "-alpha", "set", "(", "-size", f"{s}x{s}", "xc:none", "-fill", "white",
                   "-draw", f"roundrectangle 0,0,{s-1},{s-1},{r},{r}", ")",
                   "-compose", "DstIn", "-composite", f"{SCR}/{k}-{s}-ios.png")
            magick(f"{SCR}/{k}-{s}-ios.png", "-filter", "point", "-resize", "400%", f"{SCR}/{k}-{s}-ios-x4.png")
        # Android circle: green bg + foreground, crop to 72/108 viewport, circle mask
        render(f"{SCR}/{k}-fg-android.svg", f"{SCR}/{k}-fg.png", 324)
        magick("-size", "324x324", f"xc:{G}", f"{SCR}/{k}-fg.png", "-composite",
               "-gravity", "center", "-crop", "216x216+0+0", "+repage", "-alpha", "set",
               "(", "-size", "216x216", "xc:none", "-fill", "white", "-draw", "circle 108,108 108,0", ")",
               "-compose", "DstIn", "-composite", f"{SCR}/{k}-android.png")
        # safe-zone check: foreground alpha outside the 66/108 circle
        magick(f"{SCR}/{k}-fg.png", "-alpha", "extract",
               "(", "-size", "324x324", "xc:white", "-fill", "black",
               "-draw", f"circle 162,162 162,{162 - 99}", ")",
               "-compose", "Multiply", "-composite", "-format", f"{k} outside-safe-zone mean=%[fx:mean]\n", "info:")
        cells.append(k)

    # ---- sheet ----
    rowh, W = 470, 1640
    H = 90 + rowh * len(cells)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
           '<text x="24" y="44" font-family="Helvetica" font-size="28" font-weight="700" fill="#1C2321">'
           'Dog Schedule app icon concepts</text>',
           '<text x="24" y="74" font-family="Helvetica" font-size="15" fill="#5A635F">'
           '1024 render (shown at 360) · 180 / 60 / 29 px at true size in iOS mask on light and dark · '
           '4x pixel zoom of 60 and 29 · Android circle with dashed 66dp safe zone</text>']
    for i, k in enumerate(cells):
        y0 = 90 + i * rowh
        out.append(f'<text x="24" y="{y0 + 28}" font-family="Helvetica" font-size="17" font-weight="700" '
                   f'fill="#1C2321">Concept {k.upper()} — {RATIONALE[k]}</text>')
        y = y0 + 44
        out.append(f'<image x="24" y="{y}" width="360" height="360" href="{b64(f"{SCR}/{k}-1024.png")}"/>')
        for j, (bg, fgtxt) in enumerate((("#F2F2F7", "#5A635F"), ("#000000", "#AAAAAA"))):
            px = 404 + j * 330
            out.append(f'<rect x="{px}" y="{y}" width="320" height="360" rx="12" fill="{bg}"/>')
            out.append(f'<image x="{px + 16}" y="{y + 16}" width="180" height="180" href="{b64(f"{SCR}/{k}-180-ios.png")}"/>')
            out.append(f'<image x="{px + 216}" y="{y + 16}" width="60" height="60" href="{b64(f"{SCR}/{k}-60-ios.png")}"/>')
            out.append(f'<image x="{px + 216}" y="{y + 96}" width="29" height="29" href="{b64(f"{SCR}/{k}-29-ios.png")}"/>')
            out.append(f'<image x="{px + 16}" y="{y + 212}" width="116" height="116" href="{b64(f"{SCR}/{k}-29-ios-x4.png")}"/>')
            out.append(f'<image x="{px + 148}" y="{y + 212}" width="160" height="160" href="{b64(f"{SCR}/{k}-60-ios-x4.png")}" '
                       f'transform="translate({px + 148} {y + 212}) scale(0.9) translate({-(px + 148)} {-(y + 212)})"/>')
            out.append(f'<text x="{px + 216}" y="{y + 160}" font-family="Helvetica" font-size="12" fill="{fgtxt}">'
                       '180 · 60 · 29</text>')
        ax = 1074
        out.append(f'<rect x="{ax}" y="{y}" width="260" height="360" rx="12" fill="#ECEFF1"/>')
        out.append(f'<image x="{ax + 22}" y="{y + 22}" width="216" height="216" href="{b64(f"{SCR}/{k}-android.png")}"/>')
        out.append(f'<circle cx="{ax + 130}" cy="{y + 130}" r="99" fill="none" stroke="#FF3B30" '
                   'stroke-width="1.5" stroke-dasharray="5 4"/>')
        out.append(f'<text x="{ax + 22}" y="{y + 270}" font-family="Helvetica" font-size="13" fill="#5A635F">'
                   'Android adaptive (circle mask)</text>')
        # Android small
        magick(f"{SCR}/{k}-android.png", "-resize", "48x48", f"{SCR}/{k}-android-48.png")
        out.append(f'<image x="{ax + 22}" y="{y + 284}" width="48" height="48" href="{b64(f"{SCR}/{k}-android-48.png")}"/>')
        out.append(f'<rect x="{1350}" y="{y}" width="270" height="360" rx="12" fill="#1C2321"/>')
        out.append(f'<image x="{1365}" y="{y + 15}" width="240" height="240" href="{b64(f"{SCR}/{k}-180-ios.png")}"/>')
        out.append(f'<text x="1365" y="{y + 290}" font-family="Helvetica" font-size="13" fill="#AAAAAA">'
                   'iOS mask, dark wallpaper</text>')
    out.append("</svg>")
    write(f"{SCR}/compare.svg", "\n".join(out))
    subprocess.run(["rsvg-convert", f"{SCR}/compare.svg", "-o", os.path.join(CONCEPTS, "compare.png")], check=True)
    print("ok")
