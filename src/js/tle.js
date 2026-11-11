window.TLE = (function () {
  "use strict";

  var CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php";
  
  var CACHE_TTL_MS = 115 * 60 * 1000;
  var FETCH_TIMEOUT_MS = 25000;

  var GROUPS = [
    { id: "stations",            label: "SPACE STATIONS",        color: "#ffffff" },
    { id: "tle-new",             label: "RECENT LAUNCHES",       color: "#1dd1a1" },
    { id: "visual",              label: "BRIGHT / VISUAL",       color: "#ffe66d" },
    { id: "starlink",            label: "STARLINK",              color: "#ffb066" },
    { id: "oneweb",              label: "ONEWEB",                color: "#6ec1ff" },
    { id: "kuiper",              label: "KUIPER",                color: "#c792ea" },
    { id: "qianfan",             label: "QIANFAN",               color: "#7bed9f" },
    { id: "gps-ops",             label: "GPS",                   color: "#54a0ff" },
    { id: "weather",             label: "WEATHER",               color: "#48dbfb" },
    { id: "geo",                 label: "GEO",                   color: "#feca57" },
    { id: "cubesat",             label: "CUBESATS",              color: "#a29bfe" },
    { id: "science",             label: "SCIENCE",               color: "#f368e0" },
    { id: "iridium-33-debris",   label: "DEBRIS · IRIDIUM-33",   color: "#ff6b6b" },
    { id: "cosmos-2251-debris",  label: "DEBRIS · COSMOS-2251",  color: "#ff6b6b" },
    { id: "fengyun-1c-debris",   label: "DEBRIS · FENGYUN-1C",   color: "#ff6b6b" },
    { id: "active",              label: "FULL CATALOG (~20K)",   color: "#8395a7", heavy: true }
  ];
  var groupById = {};
  GROUPS.forEach(function (g) { groupById[g.id] = g; });

  function cacheKey(id) { return "orbital_console_tle_" + id; }

  function readCache(id) {
    try {
      var raw = localStorage.getItem(cacheKey(id));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.ts !== "number" || typeof o.text !== "string") return null;
      if (Date.now() - o.ts > CACHE_TTL_MS) return null;
      return o.text;
    } catch (e) { return null; }
  }

  function writeCache(id, text) {
    try { localStorage.setItem(cacheKey(id), JSON.stringify({ ts: Date.now(), text: text })); }
    catch (e) {  }
  }

  function clearCache() {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf("orbital_console_tle_") === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  
  async function fetchGroup(id, force) {
    if (!force) {
      var cached = readCache(id);
      if (cached) return Promise.resolve({ text: cached, source: "cache" });
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(CELESTRAK + "?GROUP=" + encodeURIComponent(id) + "&FORMAT=tle", {
      signal: ctrl.signal,
      headers: { "Accept": "text/plain" }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      if (text.indexOf("1 ") < 0) throw new Error("empty feed");
      writeCache(id, text);
      return { text: text, source: "live" };
    }).catch(function (err) {
      var cached = readCache(id);
      if (cached) return { text: cached, source: "cache" };
      throw err;
    }).finally(function () { clearTimeout(timer); });
  }

  
  function parse(text) {
    var lines = String(text).split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l1 = lines[i];
      if (l1.length > 68 && l1.charAt(0) === "1" && l1.charAt(1) === " " &&
          i + 1 < lines.length && lines[i + 1].charAt(0) === "2" && lines[i + 1].charAt(1) === " ") {
        var prev = i > 0 ? lines[i - 1] : "";
        var name = (/^[12] /.test(prev)) ? "" : prev.trim();
        out.push({
          name: name,
          satnum: parseInt(l1.substring(2, 7), 10),
          line1: l1,
          line2: lines[i + 1]
        });
        i++;
      }
    }
    return out;
  }

  function attachGroup(objs, id) {
    for (var i = 0; i < objs.length; i++) objs[i].group = id;
    return objs;
  }

  
  function loadAll(onGroup) {
    var res = { objects: [], byGroup: {}, live: 0, cached: 0, failed: [] };
    var jobs = GROUPS.map(function (g) {
      return fetchGroup(g.id, false).then(function (r) {
        var objs = attachGroup(parse(r.text), g.id);
        res.byGroup[g.id] = objs;
        if (r.source === "live") res.live++; else res.cached++;
        if (onGroup) onGroup(g, objs.length, r.source);
        return objs;
      }).catch(function () {
        res.failed.push(g.id);
        res.byGroup[g.id] = [];
        if (onGroup) onGroup(g, 0, "failed");
        return [];
      });
    });
    return Promise.all(jobs).then(function (arrays) {
      var seen = {};
      for (var a = 0; a < arrays.length; a++) {
        var arr = arrays[a];
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          if (o.satnum && !seen[o.satnum]) { seen[o.satnum] = 1; res.objects.push(o); }
        }
      }
      return res;
    });
  }

  
  function refreshAll(onGroup) {
    var res = { objects: [], byGroup: {}, live: 0, cached: 0, failed: [] };
    var jobs = GROUPS.map(function (g) {
      return fetchGroup(g.id, true).then(function (r) {
        var objs = attachGroup(parse(r.text), g.id);
        res.byGroup[g.id] = objs;
        if (r.source === "live") res.live++; else res.cached++;
        if (onGroup) onGroup(g, objs.length, r.source);
        return objs;
      }).catch(function () {
        res.failed.push(g.id);
        res.byGroup[g.id] = [];
        if (onGroup) onGroup(g, 0, "failed");
        return [];
      });
    });
    return Promise.all(jobs).then(function (arrays) {
      var seen = {};
      for (var a = 0; a < arrays.length; a++) {
        var arr = arrays[a];
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          if (o.satnum && !seen[o.satnum]) { seen[o.satnum] = 1; res.objects.push(o); }
        }
      }
      return res;
    });
  }

  return {
    CELESTRAK: CELESTRAK,
    CACHE_TTL_MS: CACHE_TTL_MS,
    GROUPS: GROUPS,
    groupById: groupById,
    parse: parse,
    fetchGroup: fetchGroup,
    loadAll: loadAll,
    refreshAll: refreshAll,
    readCache: readCache,
    clearCache: clearCache
  };
})();
