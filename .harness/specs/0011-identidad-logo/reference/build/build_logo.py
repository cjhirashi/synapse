"""SPEC-0011: build the cyan-gradient logo variants (option B) from Carlos's original.

Front layer (#2643d4 base shapes) and back layer (#0f3ab5 tubes + terminal dot) each get
one continuous userSpaceOnUse gradient, so no shape changes colour abruptly.
Dropped as redundant once both layers are uniform gradients:
  - #00e3f8 rects clipped to tube shapes (they only recolour areas of the front layer),
  - #001430 @0.35 shading (same gradient over itself = invisible).
RF-015 mask check proves the silhouette is unchanged.
"""
import re, sys
src = open(sys.argv[1]).read()
body = src[src.index('</defs>') + 7:]
defs = src[src.index('<defs>') + 6:src.index('</defs>')]

def paths(fill, opacity='1'):
    return re.findall(rf'<path fill="{fill}" d="([^"]*)" fill-opacity="{opacity}"', body)

back = paths('#0f3ab5')                              # back tubes
dot = paths('#001430')                               # opaque terminal dot: painted ABOVE the front ring
front = paths('#2643d4')
# the first front path is wrapped in clip-path 1c0233fb92 (a rect); keep that clip
clip = re.search(r'<clipPath id="1c0233fb92">(.*?)</clipPath>', defs).group(1)
clipped_front = re.search(r'<g clip-path="url\(#1c0233fb92\)"><path fill="#2643d4" d="([^"]*)"', body).group(1)
front = [d for d in front if d != clipped_front]

# Crop to the measured silhouette bbox (D-7/RF-011): x 147..1350, y 214..1285 (+1 px pad)
X0, Y0, X1, Y1 = 146, 213, 1351, 1286
VB = f'{X0} {Y0} {X1 - X0} {Y1 - Y0}'

PALETTES = {
    # theme: (front start, front end, back start, back end) — every stop >=3:1 vs --bg-secondary
    'dark':  ('#22d3ee', '#0891b2', '#0891b2', '#0e7490'),
    'light': ('#0891b2', '#0e7490', '#155e75', '#164e63'),
}
def grad(gid, a, b):
    return (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{X0}" y1="{Y0}" '
            f'x2="{X1}" y2="{Y1}"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>')

for theme, (fa, fb, ba, bb) in PALETTES.items():
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">',
           '<defs>', grad('f', fa, fb), grad('b', ba, bb),
           f'<clipPath id="c">{clip.replace(" clip-rule=\"nonzero\"", "")}</clipPath>', '</defs>',
           '<g fill="url(#b)">', *[f'<path d="{d}"/>' for d in back], '</g>',
           '<g fill="url(#f)">', f'<path clip-path="url(#c)" d="{clipped_front}"/>',
           *[f'<path d="{d}"/>' for d in front], '</g>',
           *[f'<path fill="url(#b)" d="{d}"/>' for d in dot], '</svg>']
    open(f'{sys.argv[2]}/logo-synapse-{theme}.raw.svg', 'w').write(''.join(out))
