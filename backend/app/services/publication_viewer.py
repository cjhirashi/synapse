"""Visor de imagen a pantalla completa con zoom para la página pública (H-035): el mismo del editor (`frontend/src/editor/imageViewer.ts` e `imageZoom.ts`) en JavaScript simple.

La página no permite scripts salvo este: la CSP lo autoriza por su hash SHA-256 (`VIEWER_JS_HASH`), así que cualquier otro script, incluido uno colado en el contenido, sigue bloqueado.
El texto que se firma es exactamente el que va dentro de `<script>`: no se debe reformatear al insertarlo. Sin JavaScript la página se lee igual, solo faltan los botones.
"""
import base64
import hashlib

VIEWER_CSS = """
.md-img { position: relative; display: inline-block; max-width: 100%; line-height: 0; }
.md-img > img { display: block; }
.md-img-fullscreen { position: absolute; right: 0.5rem; bottom: 0.5rem; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: color-mix(in srgb, var(--bg) 80%, transparent); color: var(--text); box-shadow: 0 0 0 1px var(--border); cursor: pointer; }
.md-img-fullscreen:hover, .md-img-fullscreen:focus-visible { background: var(--bg); }
.image-viewer { position: fixed; inset: 0; z-index: 10000; background: var(--bg); overscroll-behavior: contain; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.image-viewer-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; }
.image-viewer-stage.is-zoomed { cursor: grab; }
.image-viewer-stage.is-zoomed:active { cursor: grabbing; }
.image-viewer-img { max-width: 100vw; max-height: 100vh; border-radius: 0; object-fit: contain; transform-origin: center; will-change: transform; -webkit-user-drag: none; }
.image-viewer-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
.image-viewer-btn:disabled { opacity: 0.4; cursor: default; }
.image-viewer-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.image-viewer-close { position: absolute; top: calc(0.75rem + env(safe-area-inset-top, 0px)); right: 0.75rem; border-radius: 50%; background: var(--bg-2); box-shadow: 0 0 0 1px var(--border); font-size: 28px; line-height: 1; }
.image-viewer-controls { position: absolute; bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; background: var(--bg-2); box-shadow: 0 0 0 1px var(--border); }
.image-viewer-controls .image-viewer-btn { border-radius: 999px; }
.image-viewer-controls .image-viewer-btn:not(:disabled):hover { background: var(--bg-3); }
.image-viewer-zoom-reset { min-width: 72px; padding: 0 0.5rem; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
@media print { .md-img-fullscreen, .image-viewer { display: none !important; } }
"""

VIEWER_JS = """
(function () {
  "use strict";
  var MIN = 1, MAX = 8, STEP = 1.5, DOUBLE = 2.5, TAP_MOVE = 8, TAP_TIME = 300;
  var ICONS = {
    max: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    zin: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
    zout: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>'
  };
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }
  function clampScale(s) { return Math.min(MAX, Math.max(MIN, s)); }
  function clampView(v, b) {
    var lx = Math.max(0, (b.w * v.scale - b.vw) / 2), ly = Math.max(0, (b.h * v.scale - b.vh) / 2);
    return { scale: v.scale, x: Math.min(lx, Math.max(-lx, v.x)) + 0, y: Math.min(ly, Math.max(-ly, v.y)) + 0 };
  }
  function zoomAt(v, next, px, py, b) {
    var s = clampScale(next), k = s / v.scale;
    return clampView({ scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, b);
  }
  function pinch(start, startMid, startDist, mid, dist, b) {
    var s = clampScale(start.scale * (dist / startDist)), k = s / start.scale;
    return clampView({ scale: s, x: mid.x - (startMid.x - start.x) * k, y: mid.y - (startMid.y - start.y) * k }, b);
  }
  function button(label, cls) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "image-viewer-btn " + cls;
    el.setAttribute("aria-label", label);
    el.title = label;
    return el;
  }

  var current = null;

  function openViewer(src, alt) {
    if (current) current();
    var overlay = document.createElement("div");
    overlay.className = "image-viewer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", alt || "Imagen a pantalla completa");
    var stage = document.createElement("div");
    stage.className = "image-viewer-stage";
    var img = document.createElement("img");
    img.className = "image-viewer-img";
    img.src = src;
    img.alt = alt || "";
    img.draggable = false;
    stage.appendChild(img);
    var closeBtn = button("Cerrar pantalla completa", "image-viewer-close");
    closeBtn.textContent = "\\u00d7";
    var controls = document.createElement("div");
    controls.className = "image-viewer-controls";
    controls.setAttribute("role", "toolbar");
    controls.setAttribute("aria-label", "Zoom de la imagen");
    var zoomOut = button("Alejar", "image-viewer-zoom-out");
    zoomOut.innerHTML = icon("zout", 20);
    var reset = button("Restablecer zoom", "image-viewer-zoom-reset");
    var zoomIn = button("Acercar", "image-viewer-zoom-in");
    zoomIn.innerHTML = icon("zin", 20);
    controls.appendChild(zoomOut);
    controls.appendChild(reset);
    controls.appendChild(zoomIn);
    overlay.appendChild(stage);
    overlay.appendChild(closeBtn);
    overlay.appendChild(controls);

    var view = { scale: MIN, x: 0, y: 0 };
    function bounds() { return { w: img.offsetWidth, h: img.offsetHeight, vw: stage.clientWidth, vh: stage.clientHeight }; }
    function local(cx, cy) {
      var box = stage.getBoundingClientRect();
      return { x: cx - (box.left + box.width / 2), y: cy - (box.top + box.height / 2) };
    }
    function apply(next, animate) {
      view = next;
      img.style.transition = animate ? "transform 0.18s ease-out" : "none";
      img.style.transform = view.scale === MIN && view.x === 0 && view.y === 0 ? "" : "translate(" + view.x + "px, " + view.y + "px) scale(" + view.scale + ")";
      reset.textContent = Math.round(view.scale * 100) + " %";
      zoomOut.disabled = view.scale <= MIN;
      zoomIn.disabled = view.scale >= MAX;
      stage.classList.toggle("is-zoomed", view.scale > MIN);
    }
    function zoomBy(factor, at, animate) {
      at = at || { x: 0, y: 0 };
      apply(zoomAt(view, view.scale * factor, at.x, at.y, bounds()), animate !== false);
    }
    var home = { scale: MIN, x: 0, y: 0 };
    zoomIn.addEventListener("click", function () { zoomBy(STEP); });
    zoomOut.addEventListener("click", function () { zoomBy(1 / STEP); });
    reset.addEventListener("click", function () { apply(home, true); });
    controls.addEventListener("click", function (e) { e.stopPropagation(); });
    controls.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

    var pointers = new Map();
    var pinchStart = null, drag = null, tap = null, lastTap = null;
    function pair() { var all = Array.from(pointers.values()); return [all[0], all[1]]; }
    function startPinch() {
      var p = pair();
      pinchStart = { view: view, mid: local((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2), dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
      drag = null;
    }
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        tap = { x: e.clientX, y: e.clientY, at: e.timeStamp, moved: false, onImage: e.target === img };
        drag = { x: e.clientX, y: e.clientY, view: view };
      } else if (pointers.size === 2) {
        if (tap) tap.moved = true;
        startPinch();
      }
    });
    stage.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE) tap.moved = true;
      if (pointers.size >= 2 && pinchStart) {
        var p = pair();
        var mid = local((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        apply(pinch(pinchStart.view, pinchStart.mid, pinchStart.dist, mid, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, bounds()), false);
      } else if (drag && view.scale > MIN) {
        apply(clampView({ scale: view.scale, x: drag.view.x + e.clientX - drag.x, y: drag.view.y + e.clientY - drag.y }, bounds()), false);
      }
    });
    function release(e) {
      if (!pointers.delete(e.pointerId)) return;
      if (stage.releasePointerCapture) stage.releasePointerCapture(e.pointerId);
      if (pointers.size === 1) {
        var rest = Array.from(pointers.values())[0];
        drag = { x: rest.x, y: rest.y, view: view };
        pinchStart = null;
        return;
      }
      if (pointers.size > 0) return;
      pinchStart = null;
      drag = null;
      var finished = tap;
      tap = null;
      if (e.type !== "pointerup" || !finished || finished.moved || e.timeStamp - finished.at > TAP_TIME) return;
      if (!finished.onImage) { close(); return; }
      if (lastTap && e.timeStamp - lastTap.at < TAP_TIME && Math.hypot(finished.x - lastTap.x, finished.y - lastTap.y) < TAP_MOVE * 4) {
        lastTap = null;
        var at = local(finished.x, finished.y);
        apply(view.scale > MIN ? home : zoomAt(view, DOUBLE, at.x, at.y, bounds()), true);
      } else {
        lastTap = { x: finished.x, y: finished.y, at: e.timeStamp };
      }
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), local(e.clientX, e.clientY), false);
    }, { passive: false });

    function onResize() { apply(clampView(view, bounds()), false); }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      else if (e.key === "+" || e.key === "=") { e.stopPropagation(); zoomBy(STEP); }
      else if (e.key === "-" || e.key === "_") { e.stopPropagation(); zoomBy(1 / STEP); }
      else if (e.key === "0") { e.stopPropagation(); apply(home, true); }
    }
    function onFullscreenChange() { if (!document.fullscreenElement) close(); }
    function close() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", onResize);
      if (document.fullscreenElement === overlay && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      overlay.remove();
      if (current === close) current = null;
    }
    closeBtn.addEventListener("click", function (e) { e.stopPropagation(); close(); });
    closeBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    document.body.appendChild(overlay);
    current = close;
    apply(home, false);
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().then(function () { document.addEventListener("fullscreenchange", onFullscreenChange); }).catch(function () {});
    }
    closeBtn.focus();
  }

  function attach(img) {
    if (img.dataset.viewer) return;
    if (img.clientWidth < 96 || img.clientHeight < 64) return;
    img.dataset.viewer = "1";
    var wrap = img.parentNode;
    if (!(wrap.classList && wrap.classList.contains("md-img"))) {
      wrap = document.createElement("span");
      wrap.className = "md-img";
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
    }
    var open = document.createElement("button");
    open.type = "button";
    open.className = "md-img-fullscreen";
    open.setAttribute("aria-label", "Ver imagen en pantalla completa");
    open.title = "Pantalla completa";
    open.innerHTML = icon("max", 16);
    open.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var src = img.currentSrc || img.getAttribute("src") || "";
      if (src) openViewer(src, img.alt);
    });
    wrap.appendChild(open);
  }

  Array.prototype.forEach.call(document.querySelectorAll(".content img"), function (img) {
    if (img.complete) attach(img);
    else img.addEventListener("load", function () { attach(img); });
  });
})();
"""

VIEWER_JS_HASH = "sha256-" + base64.b64encode(hashlib.sha256(VIEWER_JS.encode("utf-8")).digest()).decode("ascii")
