"""Ranjha Play mark geometry — an "R" whose counter is a play button.

Everything is in a 1024x1024 design space; the mark's box is ~x 292..772, y 212..812.
"""
import math


def rounded_poly(points, radii):
    """Closed path through `points`, each vertex rounded with a circular arc of its radius."""
    n = len(points)
    parts = []
    for i in range(n):
        p = points[i]
        a = points[i - 1]
        b = points[(i + 1) % n]
        r = radii[i]
        if r <= 0:
            parts.append(("L", p))
            continue
        u1 = norm(sub(a, p))
        u2 = norm(sub(b, p))
        cos_t = max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1]))
        theta = math.acos(cos_t)
        t = r / math.tan(theta / 2)
        t = min(t, dist(a, p) * 0.5, dist(b, p) * 0.5)
        r_eff = t * math.tan(theta / 2)
        t1 = add(p, mul(u1, t))
        t2 = add(p, mul(u2, t))
        cross = u1[0] * u2[1] - u1[1] * u2[0]
        sweep = 1 if cross < 0 else 0
        parts.append(("L", t1))
        parts.append(("A", t2, r_eff, sweep))
    d = []
    first = parts[0]
    start = first[1]
    d.append(f"M{fmt(start)}")
    for part in parts[1:] + [first]:
        if part[0] == "L":
            d.append(f"L{fmt(part[1])}")
        else:
            _, pt, r, sweep = part
            d.append(f"A{r:.2f} {r:.2f} 0 0 {sweep} {fmt(pt)}")
    return " ".join(d) + " Z"


def arc_points(cx, cy, r, a0, a1, steps):
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def mul(a, k):
    return (a[0] * k, a[1] * k)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def norm(a):
    d = math.hypot(*a)
    return (a[0] / d, a[1] / d)


def fmt(p):
    return f"{p[0]:.2f} {p[1]:.2f}"


# --- Geometry -----------------------------------------------------------------
TOP, BOTTOM = 212, 812
STEM_L, STEM_R = 292, 452
BOWL_BOTTOM = 598
BOWL_CX = 566
BOWL_R = (BOWL_BOTTOM - TOP) / 2  # 193
BOWL_CY = TOP + BOWL_R

# Stem + bowl as one outline (clockwise), the bowl's right side sampled as an arc.
arc = arc_points(BOWL_CX, BOWL_CY, BOWL_R, -90, 90, 36)
upper_pts = [(STEM_L, TOP)] + arc[:1]
upper_rad = [34, 0]
upper_pts += arc[1:]
upper_rad += [0] * (len(arc) - 1)
upper_pts += [(STEM_R, BOWL_BOTTOM), (STEM_R, BOTTOM), (STEM_L, BOTTOM)]
upper_rad += [0, 26, 34]
UPPER = rounded_poly(upper_pts, upper_rad)

# The play-button counter inside the bowl.
TRI_H = 196
TRI_W = TRI_H * 0.88
TRI_CY = BOWL_CY
TRI_L = STEM_R + 6
COUNTER = rounded_poly(
    [(TRI_L, TRI_CY - TRI_H / 2), (TRI_L + TRI_W, TRI_CY), (TRI_L, TRI_CY + TRI_H / 2)],
    [22, 22, 22],
)

# The leg: a slanted ribbon that tucks under the bowl.
LEG_W = 168
LEG_TOP_Y = 530
_LEG_SLOPE = (604 - 500) / (BOTTOM - (BOWL_CY + 40))  # x per y of the original slant
leg_top_l = (500 + _LEG_SLOPE * (LEG_TOP_Y - (BOWL_CY + 40)), LEG_TOP_Y)
leg_top_r = (leg_top_l[0] + LEG_W, LEG_TOP_Y)
leg_bot_r = (772, BOTTOM)
leg_bot_l = (leg_bot_r[0] - LEG_W, BOTTOM)
LEG = rounded_poly([leg_top_l, leg_top_r, leg_bot_r, leg_bot_l], [0, 0, 30, 24])

# Direction of the leg, used to orient its fold shadow.
LEG_DIR = norm(sub(leg_bot_l, leg_top_l))


def mark_defs(prefix="rp"):
    return f"""
    <linearGradient id="{prefix}-ink" x1="300" y1="200" x2="780" y2="820" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF3D6E"/>
      <stop offset="0.48" stop-color="#FF2447"/>
      <stop offset="1" stop-color="#FF8A1F"/>
    </linearGradient>
    <linearGradient id="{prefix}-leg" x1="560" y1="{LEG_TOP_Y}" x2="720" y2="{BOTTOM}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C4133A"/>
      <stop offset="0.55" stop-color="#FF4A2E"/>
      <stop offset="1" stop-color="#FFA41F"/>
    </linearGradient>
    <linearGradient id="{prefix}-fold" x1="560" y1="{BOWL_BOTTOM - 10}" x2="600" y2="{BOWL_BOTTOM + 120}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="{prefix}-sheen" x1="292" y1="212" x2="560" y2="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    """


BODY = f"{UPPER} {COUNTER}"


def mark_body(prefix="rp", mono=None):
    if mono:
        return f"""
      <path d="{LEG}" fill="{mono}"/>
      <path d="{BODY}" fill="{mono}" fill-rule="evenodd"/>"""
    return f"""
      <path d="{LEG}" fill="url(#{prefix}-leg)"/>
      <path d="{LEG}" fill="url(#{prefix}-fold)"/>
      <path d="{BODY}" fill="url(#{prefix}-ink)" fill-rule="evenodd"/>
      <path d="{BODY}" fill="url(#{prefix}-sheen)" fill-rule="evenodd"/>"""


if __name__ == "__main__":
    print("BODY", BODY)
    print("LEG", LEG)
    print("LEG_TOP_Y", LEG_TOP_Y, "BOWL_BOTTOM", BOWL_BOTTOM, "BOTTOM", BOTTOM)
