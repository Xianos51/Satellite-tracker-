window.Scene3D = (function () {
  "use strict";

  var EARTH_R = 6371;          
  var FAR = 1e9;               

  function available() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  }

  function toThree(x, y, z, out, o) {
    out[o] = x; out[o + 1] = z; out[o + 2] = -y;
  }

  function makeGraticule() {
    var pts = [];
    var r = EARTH_R + 4;
    var lat, lon, i;
    for (lat = -80; lat <= 80; lat += 10) {
      for (i = 0; i < 360; i += 5) {
        var a = i * Math.PI / 180, b = (i + 5) * Math.PI / 180;
        var la = lat * Math.PI / 180;
        pts.push(r * Math.cos(la) * Math.cos(a), r * Math.sin(la), r * Math.cos(la) * Math.sin(a));
        pts.push(r * Math.cos(la) * Math.cos(b), r * Math.sin(la), r * Math.cos(la) * Math.sin(b));
      }
    }
    for (lon = 0; lon < 360; lon += 10) {
      var lo = lon * Math.PI / 180;
      for (i = -80; i < 80; i += 5) {
        var a1 = i * Math.PI / 180, b1 = (i + 5) * Math.PI / 180;
        pts.push(r * Math.cos(a1) * Math.cos(lo), r * Math.sin(a1), r * Math.cos(a1) * Math.sin(lo));
        pts.push(r * Math.cos(b1) * Math.cos(lo), r * Math.sin(b1), r * Math.cos(b1) * Math.sin(lo));
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    var m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x2a6ea6, transparent: true, opacity: 0.45
    }));
    m.frustumCulled = false;
    return m;
  }

  function makeStars(count) {
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      
      var u = Math.random() * 2 - 1;
      var th = Math.random() * Math.PI * 2;
      var s = Math.sqrt(1 - u * u);
      var R = 180000;
      pos[i * 3] = R * s * Math.cos(th);
      pos[i * 3 + 1] = R * s * Math.sin(th);
      pos[i * 3 + 2] = R * u;
      var b = 0.45 + Math.random() * 0.55;
      var warm = Math.random() < 0.18;
      col[i * 3] = b * (warm ? 1 : 0.82);
      col[i * 3 + 1] = b * (warm ? 0.88 : 0.9);
      col[i * 3 + 2] = b * (warm ? 0.7 : 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var p = new THREE.Points(g, new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.9, depthWrite: false
    }));
    p.frustumCulled = false;
    return p;
  }

  function makeSunSprite() {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,240,200,0.9)");
    g.addColorStop(0.6, "rgba(255,190,90,0.28)");
    g.addColorStop(1, "rgba(255,160,60,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    spr.scale.set(26000, 26000, 1);
    return spr;
  }

  function makeSelMarker() {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var x = c.getContext("2d");
    x.strokeStyle = "#ffd800";
    x.lineWidth = 3;
    x.beginPath(); x.arc(32, 32, 22, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = "rgba(255,130,5,0.9)";
    x.lineWidth = 2;
    [[32, 2], [32, 14], [32, 50], [32, 62], [2, 32], [14, 32], [50, 32], [62, 32]].forEach(function (p) {
      x.beginPath(); x.moveTo(p[0] - 4, p[1]); x.lineTo(p[0] + 4, p[1]); x.stroke();
      x.beginPath(); x.moveTo(p[0], p[1] - 4); x.lineTo(p[0], p[1] + 4); x.stroke();
    });
    var tex = new THREE.CanvasTexture(c);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false
    }));
    spr.scale.set(2600, 2600, 1);
    spr.visible = false;
    return spr;
  }

  function create(canvas) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01020a);

    var camera = new THREE.PerspectiveCamera(50, 1, 1, 500000);
    camera.position.set(0, 15000, 27000);

    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = EARTH_R + 400;
    controls.maxDistance = 300000;
    controls.rotateSpeed = 0.55;

    var sunLight = new THREE.DirectionalLight(0xffffff, 1.25);
    scene.add(sunLight);
    scene.add(sunLight.target);
    scene.add(new THREE.AmbientLight(0x405070, 0.5));

    
    var earthGroup = new THREE.Group();
    scene.add(earthGroup);

    var loader = new THREE.TextureLoader();
    var dayTex = loader.load(window.EARTH_TEXTURES.day);
    var nightTex = loader.load(window.EARTH_TEXTURES.night);
    dayTex.encoding = THREE.sRGBEncoding;
    nightTex.encoding = THREE.sRGBEncoding;

    var earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R, 96, 64),
      new THREE.MeshPhongMaterial({
        map: dayTex,
        emissiveMap: nightTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.9,
        specular: new THREE.Color(0x1a2a3a),
        shininess: 7
      })
    );
    earthGroup.add(earth);
    earthGroup.add(makeGraticule());

    if (window.satellite) {
      var kGd = {
        longitude: window.satellite.degreesToRadians(-52.6503),
        latitude: window.satellite.degreesToRadians(5.1594),
        height: 0.01
      };
      var kEcf = window.satellite.geodeticToEcf(kGd);
      var kLen = Math.hypot(kEcf.x, kEcf.y, kEcf.z);
      var kScale = (EARTH_R + 30) / kLen;
      var station = new THREE.Mesh(
        new THREE.SphereGeometry(110, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xff8205 })
      );
      station.position.set(kEcf.x * kScale, kEcf.z * kScale, -kEcf.y * kScale);
      earthGroup.add(station);
    }

    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.04, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4d9fff, transparent: true, opacity: 0.13,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    scene.add(atmo);

    scene.add(makeStars(4500));
    var sunSprite = makeSunSprite();
    scene.add(sunSprite);
    var selMarker = makeSelMarker();
    scene.add(selMarker);

    
    var points = null, posAttr = null, n = 0;
    var MAX_POINTS = 60000;

    
    var ORBIT_MAX = 720;
    var orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ORBIT_MAX * 3), 3));
    var orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({
      color: 0xff8205, transparent: true, opacity: 0.85
    }));
    orbitLine.frustumCulled = false;
    orbitLine.visible = false;
    scene.add(orbitLine);

    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();

    var state = {
      positions: null, colors: null, count: 0, gmst: 0,
      orbit: null, selected: -1, focus: -1
    };

    function setCatalog(count, colorsF32) {
      n = Math.min(count, MAX_POINTS);
      if (points) { scene.remove(points); points.geometry.dispose(); }
      var g = new THREE.BufferGeometry();
      posAttr = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      var colAttr = new THREE.BufferAttribute(colorsF32, 3);
      g.setAttribute("position", posAttr);
      g.setAttribute("color", colAttr);
      g.setDrawRange(0, n);
      points = new THREE.Points(g, new THREE.PointsMaterial({
        size: 2.4, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0.95, depthWrite: false
      }));
      points.frustumCulled = false;
      scene.add(points);
      state.count = n;
    }

    function updatePositions(positionsF32) {
      if (!posAttr) return;
      posAttr.array.set(positionsF32.subarray(0, n * 3));
      posAttr.needsUpdate = true;
    }

    function setEarthRotation(gmst) {
      earthGroup.rotation.y = gmst;
      state.gmst = gmst;
    }

    function setSunDir(x, y, z) {
      var R = 200000;
      sunLight.position.set(x * R, z * R, -y * R);
      sunSprite.position.set(x * R, z * R, -y * R);
    }

    function setOrbitLine(pts) {
      if (!pts || pts.length < 2) { orbitLine.visible = false; state.orbit = null; return; }
      var m = Math.min(pts.length, ORBIT_MAX);
      var arr = orbitGeo.attributes.position.array;
      for (var i = 0; i < m; i++) {
        arr[i * 3] = pts[i][0];
        arr[i * 3 + 1] = pts[i][2];
        arr[i * 3 + 2] = -pts[i][1];
      }
      orbitGeo.setDrawRange(0, m);
      orbitGeo.attributes.position.needsUpdate = true;
      orbitLine.visible = true;
      state.orbit = pts;
    }

    function setSelected(idx) {
      state.selected = idx;
      selMarker.visible = idx >= 0;
    }

    function pick(clientX, clientY, rect) {
      if (!points || n === 0) return -1;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      var dist = camera.position.distanceTo(controls.target);
      raycaster.params.Points.threshold = Math.max(120, dist * 0.006);
      var hits = raycaster.intersectObject(points, false);
      if (!hits.length) return -1;
      hits.sort(function (a, b) { return a.distance - b.distance; });
      var idx = hits[0].index;
      return (idx === undefined || idx === null || idx >= n) ? -1 : idx;
    }

    function screenPos(idx, positionsF32) {
      if (idx < 0 || idx >= n || !positionsF32) return null;
      var p = positionsF32;
      var v = new THREE.Vector3(p[idx * 3], p[idx * 3 + 1], p[idx * 3 + 2]);
      if (!isFinite(v.x)) return null;
      v.project(camera);
      if (v.z > 1) return null;
      var rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
    }

    function focus(idx) { state.focus = idx; }
    function unfocus() { state.focus = -1; }

    function resetView() {
      state.focus = -1;
      camera.position.set(0, 15000, 27000);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function render() {
      if (state.focus >= 0 && state.positions) {
        var i = state.focus * 3;
        var p = state.positions;
        if (isFinite(p[i])) {
          controls.target.set(p[i], p[i + 1], p[i + 2]);
        }
      }
      if (state.selected >= 0 && state.positions) {
        var j = state.selected * 3;
        var q = state.positions;
        if (isFinite(q[j])) selMarker.position.set(q[j], q[j + 1], q[j + 2]);
      }
      controls.update();
      renderer.render(scene, camera);
    }

    return {
      mode: "3d",
      canvas: canvas,
      EARTH_R: EARTH_R,
      FAR: FAR,
      setCatalog: setCatalog,
      updatePositions: updatePositions,
      setEarthRotation: setEarthRotation,
      setSunDir: setSunDir,
      setOrbitLine: setOrbitLine,
      setSelected: setSelected,
      setState: function (s) {
        state.positions = s.positions;
        state.colors = s.colors;
        state.count = s.count;
        if (typeof s.selected === "number") state.selected = s.selected;
      },
      pick: pick,
      screenPos: screenPos,
      focus: focus,
      unfocus: unfocus,
      resetView: resetView,
      resize: resize,
      render: render
    };
  }

  return { available: available, create: create, EARTH_R: EARTH_R, FAR: FAR };
})();
