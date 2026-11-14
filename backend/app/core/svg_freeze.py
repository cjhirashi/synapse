"""SVG animado → su último fotograma (H-036). Reglas puras, sin E/S.

WeasyPrint dibuja el SVG sin animar, en su estado inicial. Para que el PDF muestre el final, antes de dibujar se «congelan» las animaciones:
cada animación pasa a ser el valor con que termina.

- SMIL: `animate` y `set` (el último valor de `values`, o `to`), `animateTransform` (`transform` final) y `animateMotion` (traslada al punto final de su ruta).
- CSS: `@keyframes` + `animation` / `animation-name` en `<style>` o en `style=""`: al elemento se le aplican las propiedades del último fotograma
  (`to` / `100%`; el primero si la animación va `reverse`).
- No cubre animación hecha con JavaScript (el SVG de un `<img>` no la ejecuta) ni `transform-origin` propio de CSS.

Si el SVG no se puede interpretar, se devuelve tal cual.
"""
import re
import xml.etree.ElementTree as ET

SVG = "http://www.w3.org/2000/svg"
MAX_BYTES = 6 * 1024 * 1024
_CSS_PROPS = {
    "opacity", "fill", "stroke", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-dashoffset", "stroke-dasharray", "visibility", "display",
    "stop-color", "stop-opacity", "r", "cx", "cy", "rx", "ry", "x", "y", "width", "height", "d", "font-size", "color",
}
# Atributos de presentación que se cambian como atributo (no en `style`) para que el SVG quede lo más estándar posible.
_ATTR_ONLY = {"x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "d"}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _last_value(node: ET.Element) -> str | None:
    values = node.get("values")
    if values and values.strip():
        parts = [part.strip() for part in values.split(";") if part.strip()]
        if parts:
            return parts[-1]
    return node.get("to")


def _set_style(element: ET.Element, prop: str, value: str) -> None:
    styles = [item for item in (element.get("style") or "").split(";") if item.strip() and item.split(":")[0].strip() != prop]
    styles.append(f"{prop}:{value}")
    element.set("style", ";".join(styles))


def _css_transform(value: str) -> str:
    """Función de transformación CSS → atributo `transform` de SVG (sin unidades `px` ni `deg`)."""
    cleaned = re.sub(r"(-?\d*\.?\d+)(px|deg)\b", r"\1", value)
    return re.sub(r"\s*,\s*", ", ", cleaned).strip()


_NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"


def path_end(path: str) -> tuple[float, float] | None:
    """Punto final de una ruta SVG (para `animateMotion`)."""
    x = y = sx = sy = 0.0
    found = False
    for command, args in re.findall(r"([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)", path):
        numbers = [float(n) for n in re.findall(_NUM, args)]
        rel = command.islower()
        upper = command.upper()
        if upper == "Z":
            x, y = sx, sy
            continue
        step = {"M": 2, "L": 2, "T": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "A": 7}[upper]
        for i in range(0, len(numbers) - step + 1, step):
            chunk = numbers[i:i + step]
            if upper == "H":
                x = x + chunk[0] if rel else chunk[0]
            elif upper == "V":
                y = y + chunk[0] if rel else chunk[0]
            else:
                px, py = chunk[-2], chunk[-1]
                x, y = (x + px, y + py) if rel else (px, py)
            if upper == "M" and i == 0:
                sx, sy = x, y
            found = True
    return (x, y) if found else None


def _freeze_smil(root: ET.Element) -> None:
    for parent in list(root.iter()):
        for child in list(parent):
            name = _local(child.tag)
            if name not in ("animate", "set", "animateTransform", "animateMotion", "animateColor"):
                continue
            attribute = child.get("attributeName")
            if name in ("animate", "set", "animateColor") and attribute and not attribute.startswith("xlink"):
                final = _last_value(child)
                if final is not None:
                    parent.set(attribute, final)
            elif name == "animateTransform":
                final = _last_value(child)
                kind = child.get("type", "translate")
                if final is not None:
                    piece = f"{kind}({final})"
                    parent.set("transform", f"{parent.get('transform', '')} {piece}".strip() if child.get("additive") == "sum" else piece)
            elif name == "animateMotion":
                end = path_end(child.get("path") or "")
                if end is not None:
                    parent.set("transform", f"{parent.get('transform', '')} translate({end[0]:g} {end[1]:g})".strip())
            parent.remove(child)


def _declarations(tinycss2, content) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in tinycss2.parse_blocks_contents(content, skip_comments=True, skip_whitespace=True):
        if item.type == "declaration":
            out[item.lower_name] = tinycss2.serialize(item.value).strip()
    return out


def _keyframes(tinycss2, rules) -> dict[str, tuple[dict[str, str], dict[str, str]]]:
    """Nombre → (primer fotograma, último fotograma)."""
    frames: dict[str, tuple[dict[str, str], dict[str, str]]] = {}
    for rule in rules:
        if rule.type != "at-rule" or not rule.lower_at_keyword.endswith("keyframes") or rule.content is None:
            continue
        name = tinycss2.serialize(rule.prelude).strip().strip("\"'")
        steps: list[tuple[float, dict[str, str]]] = []
        for block in tinycss2.parse_blocks_contents(rule.content, skip_comments=True, skip_whitespace=True):
            if block.type != "qualified-rule":
                continue
            for selector in tinycss2.serialize(block.prelude).split(","):
                text = selector.strip().lower()
                point = 0.0 if text == "from" else 100.0 if text == "to" else float(text.rstrip("%")) if re.fullmatch(r"[\d.]+%", text) else None
                if point is not None:
                    steps.append((point, _declarations(tinycss2, block.content)))
        if steps:
            steps.sort(key=lambda step: step[0])
            frames[name] = (steps[0][1], steps[-1][1])
    return frames


def _animation_of(declarations: dict[str, str], names: set[str]) -> tuple[str, bool] | None:
    """(nombre de la animación, ¿va en reversa?) de un conjunto de declaraciones."""
    chosen = declarations.get("animation-name")
    text = declarations.get("animation", "")
    if chosen is None:
        chosen = next((token for token in re.split(r"[\s,]+", text) if token in names), None)
    if chosen is None or chosen not in names:
        return None
    direction = declarations.get("animation-direction", text)
    return chosen, bool(re.search(r"\breverse\b", direction)) and "alternate" not in direction


def _apply(element: ET.Element, props: dict[str, str]) -> None:
    for prop, value in props.items():
        value = re.sub(r"\s*!important\s*$", "", value)
        if prop == "transform":
            element.set("transform", _css_transform(value))
        elif prop in _ATTR_ONLY:
            element.set(prop, value)
        elif prop in _CSS_PROPS:
            _set_style(element, prop, value)


def _freeze_css(root: ET.Element) -> None:
    try:
        import cssselect2
        import tinycss2
    except ImportError:  # pragma: no cover — vienen con WeasyPrint
        return
    sheets = [element.text or "" for element in root.iter() if _local(element.tag) == "style"]
    rules = [rule for sheet in sheets for rule in tinycss2.parse_stylesheet(sheet, skip_comments=True, skip_whitespace=True)]
    frames = _keyframes(tinycss2, rules)
    if not frames:
        return
    matcher = cssselect2.Matcher()
    for index, rule in enumerate(rules):
        if rule.type != "qualified-rule":
            continue
        declarations = _declarations(tinycss2, rule.content)
        found = _animation_of(declarations, set(frames))
        if found is None:
            continue
        try:
            for selector in cssselect2.compile_selector_list(tinycss2.serialize(rule.prelude)):
                matcher.add_selector(selector, (index, found))
        except cssselect2.SelectorError:
            continue
    wrapper = cssselect2.ElementWrapper.from_xml_root(root)
    for item in wrapper.iter_subtree():
        element = item.etree_element
        applied = [payload for *_, pseudo, payload in matcher.match(item) if not pseudo]
        inline = _animation_of(_declarations(tinycss2, element.get("style", "")), set(frames)) if element.get("style") else None
        for found in ([payload[1] for payload in sorted(applied, key=lambda p: p[0])] + ([inline] if inline else [])):
            first, last = frames[found[0]]
            _apply(element, first if found[1] else last)


def freeze(data: bytes) -> bytes:
    """El SVG con sus animaciones llevadas al último fotograma; si no es un SVG interpretable (o trae entidades), el mismo."""
    if len(data) > MAX_BYTES or re.search(rb"<!ENTITY", data, re.IGNORECASE):
        return data
    if not re.search(rb"<(animate|set|animateTransform|animateMotion|animateColor)\b|@(-\w+-)?keyframes|animation", data):
        return data
    try:
        ET.register_namespace("", SVG)
        ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
        root = ET.fromstring(data)
        if _local(root.tag) != "svg":
            return data
        _freeze_smil(root)
        _freeze_css(root)
        return ET.tostring(root, encoding="utf-8", xml_declaration=True)
    except Exception:  # noqa: BLE001 — un SVG raro se imprime como venga
        return data
