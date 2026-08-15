/* ============================================================================
 * Service Radar – lokale, eigenständige Mini-Karte (kein CDN, keine Abhängigkeit)
 * ----------------------------------------------------------------------------
 * Implementiert genau die Leaflet-Teil-API, die Service Radar verwendet:
 *   L.map(id,opts) .setView/.flyTo/.invalidateSize/.remove
 *   L.tileLayer(url,opts).addTo(map)
 *   L.marker([lat,lng],{icon}).addTo(map).bindPopup().bindTooltip().on('click').setLatLng().remove()
 *   L.divIcon({html,iconSize,iconAnchor,className})
 *   L.circle([lat,lng],{radius,color,fillColor,fillOpacity,weight,dashArray}).addTo(map).setLatLng().setRadius().remove()
 * Rendert OpenStreetMap-Raster-Tiles (Daten von tile.openstreetmap.org – wie bei
 * jeder Karte; in der Datenschutzerklärung genannt). Unterstützt Ziehen + Zoom-Buttons.
 * Bewusst klein gehalten – ersetzt für unseren Anwendungsfall die ~145 KB Leaflet-Lib.
 * ========================================================================== */
(function () {
  'use strict';
  var TILE = 256, MAXZ = 19, MINZ = 3, R = 6378137;

  function clampLat(lat){ return Math.max(-85.05112878, Math.min(85.05112878, lat)); }
  // lat/lng -> absolute world pixel at zoom z
  function project(lat, lng, z) {
    var n = TILE * Math.pow(2, z);
    var x = (lng + 180) / 360 * n;
    var s = Math.sin(clampLat(lat) * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x: x, y: y };
  }
  // world pixel -> lat/lng at zoom z
  function unproject(x, y, z) {
    var n = TILE * Math.pow(2, z);
    var lng = x / n * 360 - 180;
    var t = Math.PI - 2 * Math.PI * y / n;
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
    return { lat: lat, lng: lng };
  }
  function metersPerPixel(lat, z) {
    return Math.cos(lat * Math.PI / 180) * 2 * Math.PI * R / (TILE * Math.pow(2, z));
  }
  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function latLngOf(a){ return Array.isArray(a) ? { lat: +a[0], lng: +a[1] } : { lat: +a.lat, lng: +a.lng }; }

  /* ───────────────────────── Map ───────────────────────── */
  function LMap(id, opts) {
    opts = opts || {};
    this._c = (typeof id === 'string') ? document.getElementById(id) : id;
    if (!this._c) throw new Error('[map] container not found: ' + id);
    this._c.classList.add('leaflet-container');
    var pos = getComputedStyle(this._c).position;
    if (pos === 'static' || !pos) this._c.style.position = 'relative';
    this._c.style.overflow = 'hidden';
    this._c.style.background = '#e8eef3';
    this._c.innerHTML = '';
    this.center = { lat: 0, lng: 0 };
    this.zoom = 13;
    this._layers = [];
    this._markers = [];
    this._tileUrl = null;
    this._attr = '';

    this._tilePane = el('div', 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1', this._c);
    this._ovl = el('div', 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;pointer-events:none', this._c);
    this._attrEl = el('div',
      'position:absolute;right:0;bottom:0;z-index:6;background:rgba(255,255,255,.75);' +
      'font:10px/1.4 system-ui,sans-serif;color:#333;padding:1px 5px;border-top-left-radius:4px', this._c);

    // Zoom control
    if (opts.zoomControl !== false) {
      var zc = el('div',
        'position:absolute;left:10px;top:10px;z-index:7;display:flex;flex-direction:column;' +
        'border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.3)', this._c);
      var self = this;
      function zbtn(txt, df) {
        var b = el('button', 'width:30px;height:30px;border:none;background:#fff;color:#333;' +
          'font:700 18px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center', zc);
        b.type = 'button'; b.textContent = txt;
        b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); self.setZoom(self.zoom + df); };
        return b;
      }
      zbtn('+', 1);
      var sep = el('div', 'height:1px;background:#ccc', zc); void sep;
      zbtn('−', -1);
    }
    this._bindDrag();
    var self2 = this;
    window.addEventListener('resize', function () { self2._redraw(); });
    // Self-heal: redraw whenever the container reaches or changes its real size
    // (fixes "white area / partial map" when init runs before final layout).
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self2._redraw(); });
      this._ro.observe(this._c);
    }
  }
  LMap.prototype.setView = function (latlng, z) {
    this.center = latLngOf(latlng);
    if (z != null) this.zoom = Math.max(MINZ, Math.min(MAXZ, z));
    this._redraw();
    var self = this;
    if (window.requestAnimationFrame) requestAnimationFrame(function () { self._redraw(); }); // after layout
    return this;
  };
  LMap.prototype.flyTo = function (latlng, z) { return this.setView(latlng, z); }; // ohne Animation
  LMap.prototype.setZoom = function (z) { this.zoom = Math.max(MINZ, Math.min(MAXZ, z)); this._redraw(); return this; };
  LMap.prototype.invalidateSize = function () { this._redraw(); return this; };
  LMap.prototype.remove = function () { if (this._c) this._c.innerHTML = ''; };
  LMap.prototype.addLayer = function (layer) { if (this._layers.indexOf(layer) < 0) this._layers.push(layer); this._redraw(); return this; };
  LMap.prototype._size = function () {
    var c = this._c;
    var w = c.clientWidth || c.offsetWidth, h = c.clientHeight || c.offsetHeight;
    if (!w || !h) { var r = c.getBoundingClientRect(); w = w || Math.round(r.width); h = h || Math.round(r.height); }
    if ((!w || !h) && c.parentNode && c.parentNode.getBoundingClientRect) {
      var pr = c.parentNode.getBoundingClientRect();
      w = w || Math.round(pr.width); h = h || Math.round(pr.height);   // fall back to .map-frame
    }
    return { w: w || 600, h: h || 400 };
  };
  LMap.prototype._topLeft = function () {
    var s = this._size(), c = project(this.center.lat, this.center.lng, this.zoom);
    return { x: c.x - s.w / 2, y: c.y - s.h / 2 };
  };
  LMap.prototype._bindDrag = function () {
    var self = this, dragging = false, sx = 0, sy = 0, sc = null;
    var c = this._c;
    function down(e) {
      var p = e.touches ? e.touches[0] : e;
      dragging = true; sx = p.clientX; sy = p.clientY;
      sc = project(self.center.lat, self.center.lng, self.zoom);
      c.style.cursor = 'grabbing';
    }
    function move(e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      var nx = sc.x - (p.clientX - sx), ny = sc.y - (p.clientY - sy);
      self.center = unproject(nx, ny, self.zoom);
      self._redraw();
      if (e.cancelable) e.preventDefault();
    }
    function up() { dragging = false; c.style.cursor = 'grab'; }
    c.style.cursor = 'grab';
    c.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };
  LMap.prototype._redraw = function () {
    if (!this._tileUrl) { /* no tile layer yet */ }
    var s = this._size(), tl = this._topLeft(), z = this.zoom;
    // ---- tiles ----
    if (this._tileUrl) {
      var maxIdx = Math.pow(2, z);
      var frag = document.createDocumentFragment();
      var x0 = Math.floor(tl.x / TILE), x1 = Math.floor((tl.x + s.w) / TILE);
      var y0 = Math.floor(tl.y / TILE), y1 = Math.floor((tl.y + s.h) / TILE);
      for (var tx = x0; tx <= x1; tx++) {
        for (var ty = y0; ty <= y1; ty++) {
          if (ty < 0 || ty >= maxIdx) continue;
          var wx = ((tx % maxIdx) + maxIdx) % maxIdx;
          var img = new Image();
          img.src = this._tileUrl
            .replace('{s}', ['a', 'b', 'c'][Math.abs(tx + ty) % 3])
            .replace('{z}', z).replace('{x}', wx).replace('{y}', ty);
          img.style.cssText = 'position:absolute;width:256px;height:256px;user-select:none;' +
            'left:' + (tx * TILE - tl.x) + 'px;top:' + (ty * TILE - tl.y) + 'px';
          img.draggable = false; img.alt = '';
          frag.appendChild(img);
        }
      }
      this._tilePane.innerHTML = '';
      this._tilePane.appendChild(frag);
    }
    // ---- overlays (markers + circles) ----
    for (var i = 0; i < this._layers.length; i++) {
      var L_ = this._layers[i];
      if (L_._position) L_._position(tl, z);
    }
    this._attrEl.innerHTML = this._attr || '';
  };

  /* ───────────────────────── TileLayer ───────────────────────── */
  function TileLayer(url, opts) { this._url = url; this._opts = opts || {}; }
  TileLayer.prototype.addTo = function (map) {
    map._tileUrl = this._url;
    map._attr = (this._opts.attribution || '');
    map._redraw();
    return this;
  };

  /* ───────────────────────── Marker ───────────────────────── */
  function Marker(latlng, opts) {
    this._ll = latLngOf(latlng);
    this._opts = opts || {};
    this._map = null;
    this._click = null;
    this._popup = null;
    this._el = null;
  }
  Marker.prototype.addTo = function (map) {
    this._map = map;
    var icon = this._opts.icon || { html: '<div style="width:12px;height:12px;border-radius:50%;background:#0969da;border:2px solid #fff"></div>', iconSize: [12, 12], iconAnchor: [6, 6] };
    var e = el('div', 'position:absolute;z-index:3;pointer-events:auto;cursor:pointer', map._ovl);
    e.innerHTML = icon.html || '';
    if (icon.className) e.className = icon.className;
    this._el = e; this._anchor = icon.iconAnchor || [ (icon.iconSize ? icon.iconSize[0] / 2 : 0), (icon.iconSize ? icon.iconSize[1] / 2 : 0) ];
    var self = this;
    e.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (self._click) self._click();
      else if (self._popup != null) self._togglePopup();
    });
    map._layers.push(this);
    this._position(map._topLeft(), map.zoom);
    return this;
  };
  Marker.prototype._position = function (tl, z) {
    if (!this._el || !this._map) return;
    var p = project(this._ll.lat, this._ll.lng, z);
    this._el.style.left = (p.x - tl.x - this._anchor[0]) + 'px';
    this._el.style.top = (p.y - tl.y - this._anchor[1]) + 'px';
  };
  Marker.prototype.bindPopup = function (html) { this._popup = html; return this; };
  Marker.prototype.bindTooltip = function (text) { if (this._el) this._el.title = (text || '').replace(/<[^>]*>/g, ''); else this._tip = text; return this; };
  Marker.prototype.on = function (evt, fn) { if (evt === 'click') this._click = fn; return this; };
  Marker.prototype.setLatLng = function (latlng) { this._ll = latLngOf(latlng); if (this._map) this._position(this._map._topLeft(), this._map.zoom); return this; };
  Marker.prototype.openPopup = function () { this._togglePopup(true); return this; };
  Marker.prototype._togglePopup = function (force) {
    if (!this._map || this._popup == null) return;
    if (this._pop && force !== true) { this._pop.remove(); this._pop = null; return; }
    if (this._pop) return;
    var p = project(this._ll.lat, this._ll.lng, this._map.zoom), tl = this._map._topLeft();
    this._pop = el('div',
      'position:absolute;z-index:5;transform:translate(-50%,-100%);background:#fff;border:1px solid #ccc;' +
      'border-radius:8px;padding:8px 12px;font:13px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.25);white-space:nowrap;' +
      'left:' + (p.x - tl.x) + 'px;top:' + (p.y - tl.y - 14) + 'px', this._map._ovl);
    this._pop.style.pointerEvents = 'auto';
    this._pop.innerHTML = this._popup;
  };
  Marker.prototype.remove = function () {
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    if (this._pop && this._pop.parentNode) this._pop.parentNode.removeChild(this._pop);
    if (this._map) { var i = this._map._layers.indexOf(this); if (i >= 0) this._map._layers.splice(i, 1); }
    this._el = null; this._pop = null;
  };

  /* ───────────────────────── Circle ───────────────────────── */
  function Circle(latlng, opts) { this._ll = latLngOf(latlng); this._opts = opts || {}; this._r = (opts && opts.radius) || 1000; this._map = null; this._el = null; }
  Circle.prototype.addTo = function (map) {
    this._map = map;
    var o = this._opts;
    this._el = el('div', 'position:absolute;z-index:2;border-radius:50%;box-sizing:border-box;pointer-events:none', map._ovl);
    this._el.style.border = (o.weight || 2) + 'px ' + (o.dashArray ? 'dashed' : 'solid') + ' ' + (o.color || '#0969da');
    this._el.style.background = hexA(o.fillColor || o.color || '#0969da', o.fillOpacity != null ? o.fillOpacity : 0.1);
    map._layers.push(this);
    this._position(map._topLeft(), map.zoom);
    return this;
  };
  Circle.prototype._position = function (tl, z) {
    if (!this._el) return;
    var p = project(this._ll.lat, this._ll.lng, z);
    var rpx = this._r / metersPerPixel(this._ll.lat, z);
    this._el.style.width = this._el.style.height = (rpx * 2) + 'px';
    this._el.style.left = (p.x - tl.x - rpx) + 'px';
    this._el.style.top = (p.y - tl.y - rpx) + 'px';
  };
  Circle.prototype.setLatLng = function (latlng) { this._ll = latLngOf(latlng); if (this._map) this._position(this._map._topLeft(), this._map.zoom); return this; };
  Circle.prototype.setRadius = function (m) { this._r = m; if (this._map) this._position(this._map._topLeft(), this._map.zoom); return this; };
  Circle.prototype.remove = function () { if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el); if (this._map) { var i = this._map._layers.indexOf(this); if (i >= 0) this._map._layers.splice(i, 1); } this._el = null; };

  function hexA(hex, a) {
    if (hex[0] !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ───────────────────────── L namespace ───────────────────────── */
  var L = {
    map: function (id, opts) { return new LMap(id, opts); },
    tileLayer: function (url, opts) { return new TileLayer(url, opts); },
    marker: function (latlng, opts) { return new Marker(latlng, opts); },
    circle: function (latlng, opts) { return new Circle(latlng, opts); },
    divIcon: function (opts) { return opts || {}; },
    icon: function (opts) { return opts || {}; },
    version: 'service-radar-mini-1.0'
  };
  window.L = L;
})();
