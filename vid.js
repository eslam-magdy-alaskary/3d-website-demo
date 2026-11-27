/* Fuffie — scroll-scrubbed video story.
   The three AI clips are joined and exported as a WebP frame sequence (seq/f001…),
   drawn on a canvas at the frame that matches the scroll position.
   Frames load coarse-to-fine so scrubbing works before everything is downloaded. */
(function () {
  "use strict";
  var COUNT = 359, canvas = document.getElementById("vid"), ctx = canvas.getContext("2d");
  var mobile = innerWidth <= 760;
  var step = mobile ? 2 : 1;                       // phones load every 2nd frame (half the data)
  var frames = new Array(COUNT), loaded = new Array(COUNT);
  function src(i) { return "seq/f" + String(i + 1).padStart(3, "0") + ".webp"; }

  // load order: every 32nd frame, then 16th, 8th… so the whole story is roughly playable early
  var order = [], seen = {};
  for (var g = 32; g >= step; g = g / 2) for (var i = 0; i < COUNT; i += g) if (!seen[i]) { seen[i] = 1; order.push(i); }
  var q = 0, active = 0;
  function pump() {
    while (active < 6 && q < order.length) {
      (function (i) {
        var im = new Image(); active++;
        im.decoding = "async";
        im.onload = function () { frames[i] = im; loaded[i] = true; active--; if (i === 0) { document.body.classList.add("vid"); dirty = true; } dirty = true; pump(); };
        im.onerror = function () { active--; pump(); };
        im.src = src(i);
      })(order[q++]);
    }
  }
  pump();

  function nearest(i) {
    if (loaded[i]) return frames[i];
    for (var d = 1; d < COUNT; d++) {
      if (i - d >= 0 && loaded[i - d]) return frames[i - d];
      if (i + d < COUNT && loaded[i + d]) return frames[i + d];
    }
    return null;
  }

  var dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    dirty = true;
  }
  addEventListener("resize", resize);
  var dirty = true; resize();

  // focus point (0..1) the "cover" crop keeps centred — matters on tall phone screens
  function focusX(p) { return p < 0.55 ? 0.5 : 0.52; }

  var last = -1;
  function draw() {
    requestAnimationFrame(draw);
    if (window.__past) { canvas.style.visibility = "hidden"; return; }
    canvas.style.visibility = "visible";
    var p = window.__storyP || 0;
    var idx = Math.min(COUNT - 1, Math.round(p * (COUNT - 1)));
    if (idx === last && !dirty) return;
    var im = nearest(idx); if (!im) return;
    last = idx; dirty = false;
    var cw = canvas.width, ch = canvas.height, iw = im.naturalWidth, ih = im.naturalHeight;
    var s = Math.max(cw / iw, ch / ih), w = iw * s, h = ih * s;
    var x = (cw - w) * focusX(p), y = (ch - h) / 2;
    ctx.drawImage(im, x, y, w, h);
  }
  requestAnimationFrame(draw);
})();
