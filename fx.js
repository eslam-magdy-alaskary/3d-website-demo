/* Fuffie — photo story rendered with WebGL:
   organic "liquid" transitions between the four photos, slow push-in, and
   a depth-like parallax that follows the mouse (or drifts gently on phones).
   Falls back to the plain CSS crossfade when WebGL isn't available. */
(function () {
  "use strict";
  var canvas = document.getElementById("fx");
  var gl = canvas && (canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false }) || canvas.getContext("experimental-webgl"));
  if (!gl) return;

  var SRC = ["img/frame-1.webp", "img/frame-2.webp", "img/frame-3.webp", "img/frame-4.webp"];
  // focus point of each photo (x, y from the bottom), desktop / phone
  var FOCUS_D = [[0.5, 0.56], [0.5, 0.52], [0.5, 0.55], [0.5, 0.5]];
  var FOCUS_M = [[0.5, 0.72], [0.5, 0.55], [0.48, 0.58], [0.55, 0.62]];
  // how each scene arrives: 0 = bursts out from the centre (the split), 1 = pours down from the top, 2 = rises from the bottom
  var KIND = [0, 1, 2];
  var EDGES = [0.25, 0.5, 0.75], HALF = 0.075;

  var VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "precision highp float;",
    "varying vec2 v;",
    "uniform sampler2D tA,tB;",
    "uniform vec2 res,fA,fB,m;",
    "uniform float aA,aB,zA,zB,t,kind,time;",
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}",
    // cover-fit + zoom around a focus point + depth-like parallax (centre moves more than the edges)
    "vec2 place(vec2 uv,float ia,float z,vec2 f){",
    " float sa=res.x/res.y; vec2 r=vec2(min(sa/ia,1.),min(ia/sa,1.));",
    " vec2 d=uv-.5; float depth=1.-smoothstep(0.,.75,length(d));",
    " vec2 hw=.5*r/z+.02; vec2 c=clamp(f,hw,1.-hw);",
    " vec2 q=c+d*r/z+m*.018*(.35+depth)/z;",
    " return clamp(q,.001,.999);}",
    "void main(){",
    " vec2 uv=v;",
    " float g = kind<.5 ? length((uv-.5)*vec2(res.x/res.y,1.))*.85 : (kind<1.5 ? 1.-uv.y : uv.y);",
    " float nz=fbm(uv*3.2+vec2(0.,time*.04));",
    " float w=.38; float edge=(t*(1.+w)-(g*.72+nz*.28))/w; float mk=smoothstep(0.,1.,edge);",
    " vec2 flow=(vec2(nz,fbm(uv*3.2+7.3))-.5)*.09;",
    " vec2 ua=place(uv+flow*t,aA,zA*(1.+.06*t),fA);",
    " vec2 ub=place(uv-flow*(1.-t),aB,zB*(1.+.05*(1.-t)),fB);",
    " vec3 ca=texture2D(tA,ua).rgb, cb=texture2D(tB,ub).rgb;",
    // a thin warm rim where the new scene is flowing in
    " float rim=smoothstep(0.,.5,edge)*(1.-smoothstep(.5,1.,edge))*step(.001,t)*step(t,.999);",
    " vec3 c=mix(ca,cb,mk)+vec3(.16,.09,.03)*rim*.55;",
    " float vg=smoothstep(1.15,.35,length((uv-.5)*vec2(1.,.9)));",
    " c*=mix(.82,1.,vg);",
    " c+=(h(uv*res+time)-.5)*.035;",
    " gl_FragColor=vec4(c,1.);}"
  ].join("\n");

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn("fx disabled:", e); return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {};
  ["tA", "tB", "res", "fA", "fB", "m", "aA", "aB", "zA", "zB", "t", "kind", "time"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
  gl.uniform1i(U.tA, 0); gl.uniform1i(U.tB, 1);

  var tex = [], aspect = [], ready = 0;
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  SRC.forEach(function (src, i) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([239, 227, 203, 255]));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (k) { gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    tex[i] = t; aspect[i] = 1.5;
    var img = new Image();
    img.decoding = "async";
    img.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      aspect[i] = img.naturalWidth / img.naturalHeight;
      // show the canvas once the first photo is in (the CSS frames cover until then)
      if (++ready === 1 || i === 0) { window.__fx = true; document.body.classList.add("fx"); }
    };
    img.src = src;
  });

  var mobile = false;
  function resize() {
    mobile = innerWidth <= 760;
    var dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.res, canvas.width, canvas.height);
  }
  addEventListener("resize", resize); resize();

  var mx = 0, my = 0, tx = 0, ty = 0;
  addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") { tx = (e.clientX / innerWidth - 0.5) * 2; ty = -(e.clientY / innerHeight - 0.5) * 2; } }, { passive: true });

  function ease(x) { return x * x * (3 - 2 * x); }
  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  // slow push-in of a photo across its own quarter of the story
  function zoom(i, p) { return 1.03 + 0.11 * ease(clamp((p - (i * 0.25 - 0.08)) / 0.41)); }

  var t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!window.__fx) return;
    if (window.__past) { canvas.style.visibility = "hidden"; return; }
    canvas.style.visibility = "visible";
    var time = (now - t0) / 1000, p = window.__storyP || 0;
    if (mobile) { tx = Math.sin(time * 0.35) * 0.6; ty = Math.cos(time * 0.27) * 0.4; }
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;

    var a = 0, b = 0, t = 0, kind = 0;
    for (var k = 0; k < EDGES.length; k++) {
      if (p >= EDGES[k] + HALF) { a = b = k + 1; }
      else if (p > EDGES[k] - HALF) { a = k; b = k + 1; t = ease((p - (EDGES[k] - HALF)) / (2 * HALF)); kind = KIND[k]; break; }
      else break;
    }
    var F = mobile ? FOCUS_M : FOCUS_D;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[a]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[b]);
    gl.uniform2f(U.fA, F[a][0], F[a][1]); gl.uniform2f(U.fB, F[b][0], F[b][1]);
    gl.uniform1f(U.aA, aspect[a]); gl.uniform1f(U.aB, aspect[b]);
    gl.uniform1f(U.zA, zoom(a, p)); gl.uniform1f(U.zB, zoom(b, p));
    gl.uniform1f(U.t, t); gl.uniform1f(U.kind, kind); gl.uniform1f(U.time, time);
    gl.uniform2f(U.m, mx, my);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);
})();
