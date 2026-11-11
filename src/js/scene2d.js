window.Scene2D = (function () {
  "use strict";

  var FAR = 1e9;

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var img = new Image();
    img.src = window.EARTH_TEXTURES.day;

    
    var s = 2, ox = 0, oy = 0;
    var dragging = false, moved = 0, lastX = 0, lastY = 0;

    var state = { geo: null, colors: null, count: 0, selected: -1, focus: -1 };
    var orbit = null; 
    var gmstRad = 0;

    var STATION = { lat: 5.1594, lon: -52.6503, name: "CSG KOUROU" };

    function fit() {
      s = Math.min(W / 360, H / 180) * 0.98;
      ox = (W - 360 * s) / 2;
      oy = (H - 180 * s) / 2;
    }

    function resize(w, h) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
      if (s <= 0) fit();
    }

    function project(lat, lon) {
      return { x: ox + (lon + 180) * s, y: oy + (90 - lat) * s };
    }

    function setCatalog(count, colorsF32) {
      state.count = count;
      state.colors = colorsF32;
    }

    function setState(st) {
      state.geo = st.geo;
      state.colors = st.colors;
      state.count = st.count;
      if (typeof st.selected === "number") state.selected = st.selected;
      if (typeof st.gmstRad === "number") gmstRad = st.gmstRad;
    }

    function setOrbitLine(ptsEci) {
      if (!ptsEci || ptsEci.length < 2) { orbit = null; return; }
      orbit = [];
      for (var i = 0; i < ptsEci.length; i++) {
        var g = window.satellite.eciToGeodetic(ptsEci[i], gmstRad);
        orbit.push({
          lat: window.satellite.radiansToDegrees(g.latitude),
          lon: window.satellite.radiansToDegrees(g.longitude)
        });
      }
    }

    function setSelected(idx) { state.selected = idx; }
    function setEarthRotation() {}
    function setSunDir() {}
    function focus(idx) { state.focus = idx; }
    function unfocus() { state.focus = -1; }
    function resetView() { state.focus = -1; fit(); }

    function pick(clientX, clientY, rect) {
      if (!state.geo) return -1;
      var x = clientX - rect.left, y = clientY - rect.top;
      var best = -1, bestD = 15 * 15;
      for (var i = 0; i < state.count; i++) {
        var lat = state.geo[i * 2], lon = state.geo[i * 2 + 1];
        if (!isFinite(lat)) continue;
        var p = project(lat, lon);
        var dx = p.x - x, dy = p.y - y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    function screenPos(idx) {
      if (!state.geo || idx < 0 || idx >= state.count) return null;
      var lat = state.geo[idx * 2], lon = state.geo[idx * 2 + 1];
      if (!isFinite(lat)) return null;
      var p = project(lat, lon);
      var rect = canvas.getBoundingClientRect();
      return { x: rect.left + p.x, y: rect.top + p.y };
    }

    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      if (state.focus >= 0) { state.focus = -1; }
      ox += dx; oy += dy;
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var lon = (mx - ox) / s - 180, lat = 90 - (my - oy) / s;
      var s2 = Math.max(0.4, Math.min(60, s * Math.exp(-e.deltaY * 0.0016)));
      ox = mx - (lon + 180) * s2;
      oy = my - (90 - lat) * s2;
      s = s2;
      if (state.focus >= 0) state.focus = -1;
    }, { passive: false });

    function render() {
      ctx.fillStyle = "#010208";
      ctx.fillRect(0, 0, W, H);

      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, ox, oy, 360 * s, 180 * s);
      } else {
        ctx.fillStyle = "#0a1a30";
        ctx.fillRect(ox, oy, 360 * s, 180 * s);
      }

      
      ctx.strokeStyle = "rgba(42,110,166,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      var lon, lat;
      for (lon = -150; lon <= 180; lon += 30) {
        ctx.moveTo(ox + (lon + 180) * s, oy);
        ctx.lineTo(ox + (lon + 180) * s, oy + 180 * s);
      }
      for (lat = -60; lat <= 90; lat += 30) {
        ctx.moveTo(ox, oy + (90 - lat) * s);
        ctx.lineTo(ox + 360 * s, oy + (90 - lat) * s);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,130,5,0.35)";
      ctx.strokeRect(ox, oy, 360 * s, 180 * s);

      
      if (orbit && orbit.length > 1) {
        ctx.strokeStyle = "rgba(255,130,5,0.9)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (var i = 0; i < orbit.length; i++) {
          var p = project(orbit[i].lat, orbit[i].lon);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      
      var st = project(STATION.lat, STATION.lon);
      ctx.fillStyle = "#ff8205";
      ctx.beginPath();
      ctx.moveTo(st.x, st.y - 5); ctx.lineTo(st.x + 5, st.y); ctx.lineTo(st.x, st.y + 5); ctx.lineTo(st.x - 5, st.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,175,0,0.9)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(STATION.name, st.x + 8, st.y + 3);

      
      if (state.geo && state.colors) {
        for (var j = 0; j < state.count; j++) {
          var la = state.geo[j * 2], lo = state.geo[j * 2 + 1];
          if (!isFinite(la)) continue;
          var q = project(la, lo);
          if (q.x < -4 || q.x > W + 4 || q.y < -4 || q.y > H + 4) continue;
          var ci = j * 3;
          ctx.fillStyle = "rgb(" + (state.colors[ci] * 255 | 0) + "," + (state.colors[ci + 1] * 255 | 0) + "," + (state.colors[ci + 2] * 255 | 0) + ")";
          ctx.fillRect(q.x - 1, q.y - 1, 2.6, 2.6);
        }
      }

      
      if (state.selected >= 0 && state.geo) {
        var sla = state.geo[state.selected * 2], slo = state.geo[state.selected * 2 + 1];
        if (isFinite(sla)) {
          var sp = project(sla, slo);
          ctx.strokeStyle = "#ffd800";
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sp.x - 11, sp.y); ctx.lineTo(sp.x - 7, sp.y);
          ctx.moveTo(sp.x + 7, sp.y); ctx.lineTo(sp.x + 11, sp.y);
          ctx.moveTo(sp.x, sp.y - 11); ctx.lineTo(sp.x, sp.y - 7);
          ctx.moveTo(sp.x, sp.y + 7); ctx.lineTo(sp.x, sp.y + 11);
          ctx.stroke();
        }
      }

      
      if (state.focus >= 0 && state.geo) {
        var fla = state.geo[state.focus * 2], flo = state.geo[state.focus * 2 + 1];
        if (isFinite(fla)) {
          if (s < 5) s += (5 - s) * 0.08;
          var fp = project(fla, flo);
          ox += (W / 2 - fp.x) * 0.2;
          oy += (H / 2 - fp.y) * 0.2;
        }
      }
    }

    return {
      mode: "2d",
      canvas: canvas,
      FAR: FAR,
      setCatalog: setCatalog,
      setState: setState,
      setOrbitLine: setOrbitLine,
      setSelected: setSelected,
      setEarthRotation: setEarthRotation,
      setSunDir: setSunDir,
      pick: pick,
      screenPos: screenPos,
      focus: focus,
      unfocus: unfocus,
      resetView: resetView,
      resize: resize,
      render: render,
      fit: fit
    };
  }

  return { create: create, FAR: FAR };
})();
