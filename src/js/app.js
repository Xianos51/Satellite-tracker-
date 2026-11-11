(function () {
  "use strict";

  var sat = window.satellite;
  var RATES = [1, 10, 60, 600, 3600];
  var rateIdx = 2;
  var paused = false;
  var simDate = new Date();
  var lastFrame = performance.now();

  var KOUROU = {
    name: "CSG KOUROU",
    gd: { longitude: sat.degreesToRadians(-52.6503), latitude: sat.degreesToRadians(5.1594), height: 0.01 }
  };

  var objects = [];
  var satrecs = [];
  var names = [];
  var satnums = [];
  var groupOf = [];
  var n = 0;
  var pos3 = null;
  var geo = null;
  var colors = null;
  var visMask = null;
  var cursor = 0;
  var selected = -1;
  var view = null;
  var hiddenGroups = {};
  var groupStats = {};
  var orbitPts = null;
  var lastOrbitAt = 0;
  var lastTelemetryAt = 0;
  var dataSource = "sample";

  var FAR = 1e9;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showSys(msg) {
    var b = $("sysbanner");
    b.textContent = msg;
    b.hidden = false;
  }

  function setBadge(text, cls) {
    var b = $("badge");
    b.textContent = text;
    b.className = "badge " + cls;
  }

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }

  function sunVector(date) {
    var rad = Math.PI / 180;
    var j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    var d = (date.getTime() - j2000) / 86400000;
    var L = (280.460 + 0.9856474 * d) % 360;
    var g = (357.528 + 0.9856003 * d) % 360;
    var lambda = (L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) * rad;
    var eps = (23.439 - 0.0000004 * d) * rad;
    return {
      x: Math.cos(lambda),
      y: Math.cos(eps) * Math.sin(lambda),
      z: Math.sin(eps) * Math.sin(lambda)
    };
  }

  function epochFromLine1(l1) {
    try {
      var yy = parseInt(l1.substring(18, 20), 10);
      var doy = parseFloat(l1.substring(20, 32));
      var year = yy < 57 ? 2000 + yy : 1900 + yy;
      return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
    } catch (e) { return null; }
  }

  function fmt(n, d) {
    if (!isFinite(n)) return "—";
    return n.toFixed(d === undefined ? 2 : d);
  }

  function fmtUTC(d) {
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " UTC " +
      d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }

  function buildCatalog(objs, source) {
    objects = [];
    satrecs = [];
    names = [];
    satnums = [];
    groupOf = [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      try {
        var sr = sat.twoline2satrec(o.line1, o.line2);
        objects.push(o);
        satrecs.push(sr);
        names.push(o.name || ("NORAD " + o.satnum));
        satnums.push(o.satnum);
        groupOf.push(o.group || "sample");
      } catch (e) {  }
    }
    n = objects.length;
    pos3 = new Float32Array(n * 3);
    geo = new Float32Array(n * 2);
    colors = new Float32Array(n * 3);
    visMask = new Uint8Array(n).fill(1);
    var colorCache = {};
    for (var j = 0; j < n; j++) {
      var g = groupOf[j];
      if (!colorCache[g]) {
        var grp = TLE.groupById[g];
        colorCache[g] = hexToRgb(grp ? grp.color : "#ffd800");
      }
      var c = colorCache[g];
      colors[j * 3] = c[0]; colors[j * 3 + 1] = c[1]; colors[j * 3 + 2] = c[2];
      pos3[j * 3] = FAR; pos3[j * 3 + 1] = FAR; pos3[j * 3 + 2] = FAR;
      geo[j * 2] = NaN; geo[j * 2 + 1] = NaN;
    }
    dataSource = source;
    if (view) view.setCatalog(n, colors);
    cursor = 0;
    propagateRange(0, n, true);
    if (selected >= n) select(-1);
    renderGroupPanel();
    renderLegend();
    updateCount();
    if (source === "sample") setBadge("OFFLINE — SAMPLE DATA", "badge-off");
    else if (source === "local") setBadge("LOCAL FILE", "badge-cache");
  }

  function propagateRange(i0, i1, forceAll) {
    var gmst = sat.gstime(simDate);
    var t0 = performance.now();
    var budget = forceAll ? 1e9 : 4;
    var slice = Math.max(1, Math.ceil(n / 10));
    var end = Math.min(i1, i0 + (forceAll ? n : slice));
    for (var i = i0; i < end; i++) {
      if (!forceAll && performance.now() - t0 > budget) break;
      if (!visMask[i]) {
        pos3[i * 3] = FAR; pos3[i * 3 + 1] = FAR; pos3[i * 3 + 2] = FAR;
        geo[i * 2] = NaN; geo[i * 2 + 1] = NaN;
        continue;
      }
      var pv = sat.propagate(satrecs[i], simDate);
      if (pv && pv.position) {
        var p = pv.position;
        pos3[i * 3] = p.x; pos3[i * 3 + 1] = p.z; pos3[i * 3 + 2] = -p.y;
        var g = sat.eciToGeodetic(p, gmst);
        geo[i * 2] = sat.radiansToDegrees(g.latitude);
        geo[i * 2 + 1] = sat.radiansToDegrees(g.longitude);
      } else {
        pos3[i * 3] = FAR; pos3[i * 3 + 1] = FAR; pos3[i * 3 + 2] = FAR;
        geo[i * 2] = NaN; geo[i * 2 + 1] = NaN;
      }
    }
  }

  function select(idx) {
    selected = idx;
    if (view) view.setSelected(idx);
    orbitPts = null;
    lastOrbitAt = 0;
    updateTelemetry(true);
    if (idx >= 0 && view) view.focus(idx);
    else if (view) view.unfocus();
  }

  function computeOrbitLine() {
    if (selected < 0) { orbitPts = null; if (view) view.setOrbitLine(null); return; }
    var sr = satrecs[selected];
    var periodMin = 2 * Math.PI / sr.no;
    if (!isFinite(periodMin) || periodMin <= 0) return;
    periodMin = Math.min(Math.max(periodMin, 20), 1440);
    var steps = 240;
    var pts = [];
    var t0 = simDate.getTime();
    for (var i = 0; i <= steps; i++) {
      var d = new Date(t0 + (periodMin * 60000 * i) / steps);
      var pv = sat.propagate(sr, d);
      if (pv && pv.position) pts.push(pv.position);
    }
    orbitPts = pts;
    if (view) view.setOrbitLine(pts);
  }

  function updateTelemetry(force) {
    var now = performance.now();
    if (!force && now - lastTelemetryAt < 200) return;
    lastTelemetryAt = now;
    var box = $("telemetry");
    if (selected < 0) {
      box.innerHTML = '<div class="dim">no target locked — click an object or use search</div>';
      return;
    }
    var i = selected;
    var o = objects[i];
    var sr = satrecs[i];
    var pv = sat.propagate(sr, simDate);
    if (!pv || !pv.position) {
      box.innerHTML = '<div class="dim">propagation failed for this epoch</div>';
      return;
    }
    var p = pv.position;
    var v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
    var gmst = sat.gstime(simDate);
    var g = sat.eciToGeodetic(p, gmst);
    var lat = sat.radiansToDegrees(g.latitude);
    var lon = sat.radiansToDegrees(g.longitude);
    var ecf = sat.eciToEcf(p, gmst);
    var look = sat.ecfToLookAngles(KOUROU.gd, ecf);
    var az = sat.radiansToDegrees(look.azimuth);
    var elv = sat.radiansToDegrees(look.elevation);
    var range = look.rangeSat;
    var visible = elv > 0;
    var no = sr.no;
    var revDay = no * 1440 / (2 * Math.PI);
    var periodMin = 2 * Math.PI / no;
    var a = Math.pow(398600.4418 / Math.pow(no / 60, 2), 1 / 3);
    var apogee = a * (1 + sr.ecco) - 6378.137;
    var perigee = a * (1 - sr.ecco) - 6378.137;
    var epoch = epochFromLine1(o.line1);
    var grp = TLE.groupById[groupOf[i]];
    var rows = [
      ["ALTITUDE", fmt(g.height, 1) + " km"],
      ["VELOCITY", fmt(v, 3) + " km/s"],
      ["LAT / LON", fmt(lat, 3) + "° / " + fmt(lon, 3) + "°"],
      ["AZ · EL (CSG KOUROU)", fmt(az, 1) + "° · " + fmt(elv, 1) + "°"],
      ["RANGE", fmt(range, 0) + " km"],
      ["VISIBILITY", visible ? "VISIBLE" : "BELOW HORIZON", visible ? "hot" : "cold"],
      ["NORAD ID", String(o.satnum)],
      ["GROUP", grp ? grp.label : groupOf[i]],
      ["EPOCH (UTC)", epoch ? fmtUTC(epoch) : "—"]
    ];
    var elems = [
      ["INCLINATION", fmt(sat.radiansToDegrees(sr.inclo), 3) + "°"],
      ["ECCENTRICITY", fmt(sr.ecco, 6)],
      ["RAAN", fmt(sat.radiansToDegrees(sr.nodeo), 3) + "°"],
      ["ARG PERIGEE", fmt(sat.radiansToDegrees(sr.argpo), 3) + "°"],
      ["MEAN ANOMALY", fmt(sat.radiansToDegrees(sr.mo), 3) + "°"],
      ["MEAN MOTION", fmt(revDay, 6) + " rev/d"],
      ["PERIOD", fmt(periodMin, 2) + " min"],
      ["APOGEE", fmt(apogee, 1) + " km"],
      ["PERIGEE", fmt(perigee, 1) + " km"]
    ];
    var html = '<div class="t-name">' + escapeHtml(names[i]) + '</div>' +
      '<div class="t-sub">' + escapeHtml(grp ? grp.label : groupOf[i]) + " · NORAD " + o.satnum + "</div>" +
      '<div class="t-grid">';
    rows.forEach(function (r) {
      html += '<div class="k">' + r[0] + '</div><div class="v' + (r[2] ? " " + r[2] : "") + '">' + r[1] + "</div>";
    });
    html += '</div><div class="t-sect">ORBITAL ELEMENTS</div><div class="t-grid">';
    elems.forEach(function (r) {
      html += '<div class="k">' + r[0] + '</div><div class="v">' + r[1] + "</div>";
    });
    html += "</div>";
    box.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderGroupPanel() {
    var box = $("groups");
    box.innerHTML = "";
    var ids = dataSource === "sample" || dataSource === "local"
      ? ["sample"]
      : TLE.GROUPS.map(function (g) { return g.id; });
    if (dataSource === "local") ids = ["local"];
    ids.forEach(function (id) {
      var g = TLE.groupById[id];
      var label = g ? g.label : (dataSource === "sample" ? "SAMPLE SNAPSHOT" : "LOCAL FILE");
      var color = g ? g.color : "#ffd800";
      var st = groupStats[id] || { count: countGroup(id), source: dataSource === "sample" ? "sample" : dataSource };
      var row = el("div", "group-row" + (hiddenGroups[id] ? " off" : ""));
      var cb = el("input");
      cb.type = "checkbox";
      cb.checked = !hiddenGroups[id];
      cb.addEventListener("change", function () { toggleGroup(id); });
      var dot = el("span", "gdot");
      dot.style.background = color;
      var lab = el("span", "glabel", label);
      var cnt = el("span", "gcount", String(st.count));
      var src = el("span", "gsrc " + (st.source === "live" ? "live" : st.source === "cache" ? "cache" : ""), st.source === "sample" ? "SAMPLE" : st.source === "local" ? "FILE" : st.source.toUpperCase());
      row.appendChild(cb); row.appendChild(dot); row.appendChild(lab); row.appendChild(cnt); row.appendChild(src);
      row.addEventListener("click", function (e) { if (e.target !== cb) toggleGroup(id); });
      box.appendChild(row);
    });
  }

  function countGroup(id) {
    var c = 0;
    for (var i = 0; i < n; i++) if (groupOf[i] === id) c++;
    return c;
  }

  function toggleGroup(id) {
    hiddenGroups[id] = !hiddenGroups[id];
    if (hiddenGroups[id]) delete hiddenGroups[id];
    renderGroupPanel();
    updateCount();
  }

  function renderLegend() {
    var box = $("legend");
    box.innerHTML = "";
    TLE.GROUPS.forEach(function (g) {
      var row = el("div", "legend-row");
      var dot = el("span", "gdot");
      dot.style.background = g.color;
      row.appendChild(dot);
      row.appendChild(el("span", null, g.label));
      box.appendChild(row);
    });
  }

  function updateCount() {
    var vis = TLE.GROUPS.length - Object.keys(hiddenGroups).length;
    $("count").textContent = n + " OBJECTS · " + vis + "/" + TLE.GROUPS.length + " GROUPS · " +
      (view ? view.mode.toUpperCase() : "") + " MODE";
  }

  function onGroupProgress(g, count, source) {
    groupStats[g.id] = { count: count, source: source };
    renderGroupPanel();
    setBadge("FETCHING… " + Object.keys(groupStats).length + "/" + TLE.GROUPS.length, "badge-warn");
  }

  function finishBadge(res) {
    if (res.live > 0) setBadge("LIVE — CELESTRAK", "badge-live");
    else if (res.cached > 0) setBadge("CACHED — CELESTRAK (115 MIN TTL)", "badge-cache");
    else setBadge("OFFLINE — SAMPLE DATA", "badge-off");
  }

  function loadCatalog(force) {
    setBadge(force ? "REFRESHING…" : "CONNECTING…", "badge-warn");
    var fn = force ? TLE.refreshAll : TLE.loadAll;
    return fn(onGroupProgress).then(function (res) {
      if (res.objects.length === 0) {
        var sampleObjs = TLE.parse(window.SAMPLE_TLE).map(function (o) { o.group = "sample"; return o; });
        buildCatalog(sampleObjs, "sample");
        setBadge("OFFLINE — SAMPLE DATA", "badge-off");
      } else {
        buildCatalog(res.objects, "live");
        finishBadge(res);
      }
      if (force) {
        if (res.live > 0) flashStatus("TLE REFRESHED — LIVE FEED");
        else if (res.cached > 0) flashStatus("FEED UNREACHABLE — USING CACHE");
        else flashStatus("FEED UNREACHABLE — NO CACHE");
      }
    }).catch(function (err) {
      var sampleObjs = TLE.parse(window.SAMPLE_TLE).map(function (o) { o.group = "sample"; return o; });
      buildCatalog(sampleObjs, "sample");
      setBadge("OFFLINE — SAMPLE DATA", "badge-off");
      showSys("SYS // TLE FEED ERROR — " + (err && err.message ? err.message : "unknown") + " — SAMPLE DATA LOADED");
    });
  }

  var statusTimer = null;
  function flashStatus(msg) {
    var c = $("count");
    c.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(updateCount, 4000);
  }

  function setupRates() {
    var box = $("rates");
    RATES.forEach(function (r, i) {
      var b = el("button", i === rateIdx ? "on" : "", r + "×");
      b.addEventListener("click", function () { setRate(i); });
      box.appendChild(b);
    });
  }

  function setRate(i) {
    rateIdx = Math.max(0, Math.min(RATES.length - 1, i));
    $("rate").textContent = RATES[rateIdx] + "×";
    var btns = $("rates").children;
    for (var k = 0; k < btns.length; k++) btns[k].className = k === rateIdx ? "on" : "";
  }

  function togglePause() {
    paused = !paused;
    $("pause").textContent = paused ? "▶ RESUME  (SPACE)" : "⏸ PAUSE  (SPACE)";
    $("pause").classList.toggle("active", paused);
  }

  function doSearch() {
    var q = $("search").value.trim().toLowerCase();
    if (!q) return;
    for (var i = 0; i < n; i++) {
      if (names[i].toLowerCase().indexOf(q) >= 0 || String(satnums[i]) === q) {
        select(i);
        $("search").value = names[i];
        flashStatus("LOCKED: " + names[i]);
        return;
      }
    }
    flashStatus("NO MATCH: " + q);
  }

  function setupInput() {
    $("search").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doSearch(); }
      e.stopPropagation();
    });
    $("refresh").addEventListener("click", function () { loadCatalog(true); });
    $("pause").addEventListener("click", togglePause);
    $("file").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var objs = TLE.parse(String(rd.result)).map(function (o) { o.group = "local"; return o; });
        if (!objs.length) { flashStatus("NO TLE SETS FOUND IN FILE"); return; }
        groupStats = { local: { count: objs.length, source: "local" } };
        buildCatalog(objs, "local");
        setBadge("LOCAL FILE — " + f.name.toUpperCase(), "badge-cache");
        flashStatus("LOADED " + objs.length + " OBJECTS FROM " + f.name);
      };
      rd.readAsText(f);
      e.target.value = "";
    });

    var vp = $("viewport");
    var canvas = $("view");
    var downX = 0, downY = 0, downT = 0, dragging = false;

    canvas.addEventListener("pointerdown", function (e) {
      downX = e.clientX; downY = e.clientY; downT = performance.now(); dragging = true;
    });
    window.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      var moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 6 && performance.now() - downT < 600) {
        var rect = canvas.getBoundingClientRect();
        var idx = view.pick(e.clientX, e.clientY, rect);
        if (idx >= 0) select(idx);
        else select(-1);
      }
    });

    var hoverTimer = null;
    canvas.addEventListener("pointermove", function (e) {
      if (hoverTimer) return;
      hoverTimer = setTimeout(function () {
        hoverTimer = null;
        var rect = canvas.getBoundingClientRect();
        var idx = view.pick(e.clientX, e.clientY, rect);
        var tip = $("tooltip");
        if (idx >= 0) {
          tip.textContent = names[idx] + "  ·  " + satnums[idx];
          tip.hidden = false;
          tip.style.left = (e.clientX + 14) + "px";
          tip.style.top = (e.clientY + 12) + "px";
        } else {
          tip.hidden = true;
        }
      }, 70);
    });
    canvas.addEventListener("pointerleave", function () { $("tooltip").hidden = true; });

    window.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      switch (e.key) {
        case " ": e.preventDefault(); togglePause(); break;
        case "f": case "F":
          if (selected >= 0) { if (view.focusOn) {} view.focus(selected); flashStatus("FOCUS: " + names[selected]); }
          break;
        case "Escape":
          select(-1);
          if (view) { view.unfocus(); view.resetView(); }
          break;
        case "+": case "=": setRate(rateIdx + 1); break;
        case "-": case "_": setRate(rateIdx - 1); break;
        case "r": case "R": loadCatalog(true); break;
        case "/": e.preventDefault(); $("search").focus(); break;
      }
    });
  }

  function loop() {
    var now = performance.now();
    var dt = now - lastFrame;
    lastFrame = now;
    if (!paused) {
      simDate = new Date(simDate.getTime() + dt * RATES[rateIdx]);
    }
    if (n > 0) {
      var slice = Math.max(1, Math.ceil(n / 10));
      propagateRange(cursor, cursor + slice, false);
      cursor = (cursor + slice) % n;
    }
    var gmst = sat.gstime(simDate);
    var sun = sunVector(simDate);
    if (view) {
      view.setState({
        positions: pos3, geo: geo, colors: colors, count: n,
        selected: selected, gmstRad: gmst
      });
      view.updatePositions && view.updatePositions(pos3);
      view.setEarthRotation(gmst);
      view.setSunDir(sun.x, sun.y, sun.z);
      if (selected >= 0 && now - lastOrbitAt > 2000) {
        lastOrbitAt = now;
        computeOrbitLine();
      }
      updateTelemetry(false);
      view.render();
    }
    $("clock").textContent = fmtUTC(simDate);
    requestAnimationFrame(loop);
  }

  function boot() {
    window.addEventListener("error", function (e) {
      showSys("SYS // " + (e.message || "script error") + (e.filename ? " @ " + e.filename.split("/").pop() + ":" + e.lineno : ""));
    });
    window.addEventListener("unhandledrejection", function (e) {
      showSys("SYS // " + (e.reason && e.reason.message ? e.reason.message : "async error"));
    });

    var canvas = $("view");
    var vp = $("viewport");
    if (window.Scene3D && Scene3D.available()) {
      view = Scene3D.create(canvas);
    } else {
      view = Scene2D.create(canvas);
      showSys("SYS // WEBGL UNAVAILABLE (BLOCKED GPU / VM / REMOTE DESKTOP) — 2D ORTHOGRAPHIC MAP MODE");
    }
    function doResize() { view.resize(vp.clientWidth, vp.clientHeight); }
    window.addEventListener("resize", doResize);
    doResize();

    setupRates();
    setupInput();
    setRate(rateIdx);
    loadCatalog(false).then(function () {
      requestAnimationFrame(function (t) { lastFrame = t; requestAnimationFrame(loop); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
