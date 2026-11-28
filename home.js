/* homepage — 主题切换、「今日一句」、「抽一篇我写的」与「我的星图」(A26).
 *
 * Widgets read the derived pool site/portal/data/home.json, which
 * scripts/content/build-portal.sh builds from topics/** front matter filtered
 * on `status: public`; its `links` are the graphify graph projected onto that
 * same public layer (scripts/content/portal-links.py). Nothing here can reach
 * private/: the pool is the only input, generated from published content.
 *
 * Zero dependencies (A7). No JS or a failed fetch leaves the star map and
 * quote cards hidden, the draw fallback links intact, and the static
 * featured list (generator-owned) fully readable. */
(function () {
  "use strict";

  /* ── 主题（首帧已由 index.html 的内联脚本定好） ─────────── */
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-toggle");
  var themeLabel = document.getElementById("theme-label");
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    themeLabel.textContent = t === "dark" ? "白昼" : "夜航";
    themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
    if (window.__starmapRefreshPalette) { window.__starmapRefreshPalette(); }
  }
  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
  themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("portal-theme", next); } catch (e) {}
    applyTheme(next);
  });

  /* ── 日期种子：所有访客同一天看到同一句 ────────────────── */
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function todaySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  // 「」 is the only framing a quote needs; drop whatever the source used
  function quoteMarks(q) {
    return "「" + q.replace(/^[“”"'‘’「」]+/, "").replace(/[“”"'‘’」]+$/, "") + "」";
  }

  function renderCounts(pool) {
    var counts = {};
    pool.posts.forEach(function (p) { counts[p.s] = (counts[p.s] || 0) + 1; });
    document.querySelectorAll("[data-count]").forEach(function (el) {
      var c = counts[el.getAttribute("data-count")];
      el.textContent = c ? c + " 篇" : "";
    });
    return counts;
  }

  function renderQuote(pool) {
    var quotes = pool.quotes || [];
    if (!quotes.length) { return; }
    var pick = quotes[Math.floor(mulberry32(todaySeed())() * quotes.length)];
    var ql = document.getElementById("quote-link");
    var qa = document.getElementById("quote-attr");
    ql.textContent = quoteMarks(pick.q);
    ql.href = pick.u;
    qa.textContent = "《" + pick.t + "》 · " + pick.d;
    qa.href = pick.u;
    document.getElementById("today-quote").hidden = false;
  }

  function renderDraw(pool) {
    var card = document.getElementById("post-draw");
    var button = card.querySelector(".draw-button");
    var list = card.querySelector(".draw-list");
    var posts = pool.posts || [];
    if (posts.length < 2) { return; }
    var last = -1;
    function draw() {
      var i = Math.floor(Math.random() * (posts.length - 1));
      if (i >= last) { i += 1; }          // skip the previous pick
      last = i;
      var item = posts[i];
      var a = list.querySelector("a");
      a.href = item.u;
      a.querySelector(".title").textContent = item.t;
      a.querySelector("time").textContent = item.s + " · " + item.d;
      list.hidden = false;
      button.textContent = "换一篇";
      button.hidden = false;
      a.style.animation = "none";
      void a.offsetWidth;
      a.style.animation = "";
    }
    button.addEventListener("click", draw);
    draw();                              // never leave the card empty
    var fb = card.querySelector(".widget-fallback");
    if (fb) { fb.remove(); }
  }

  /* ── 星图：两个星座 + 关系/时间双层连线 ─────────────────── */
  function renderStarmap(pool, counts) {
    var canvas = document.getElementById("starmap");
    var wrap = document.getElementById("starmap-wrap");
    var mapCard = document.getElementById("starmap-card");
    var tip = document.getElementById("starmap-tip");
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx || !pool.posts.length) { return; }   // 无 canvas：卡片保持隐藏
    mapCard.hidden = false;

    var CHANNELS = ["博客", "读书笔记"];
    var palette = {};
    function refreshPalette() {
      var cs = getComputedStyle(root);
      palette = {
        blog: cs.getPropertyValue("--star-blog").trim(),
        read: cs.getPropertyValue("--star-read").trim(),
        dust: cs.getPropertyValue("--dust").trim(),
        muted: cs.getPropertyValue("--muted").trim(),
        glowBlog: cs.getPropertyValue("--glow-blog").trim(),
        glowRead: cs.getPropertyValue("--glow-read").trim(),
        card: cs.getPropertyValue("--card").trim(),
        dark: root.getAttribute("data-theme") === "dark"
      };
    }
    refreshPalette();
    window.__starmapRefreshPalette = refreshPalette;

    function channelColor(ch) { return ch === "博客" ? palette.blog : palette.read; }
    function channelGlow(ch) { return ch === "博客" ? palette.glowBlog : palette.glowRead; }

    // 确定性布局：同一份池子在任何机器上摆出同一片星空
    function seeded(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    var stars = [], dust = [], clusters = {};
    var W = 0, H = 0, DPR = 1;

    function layout() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(280, rect.width);
      H = Math.max(240, rect.height);
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      var narrow = W < 520;
      var centers = {
        "博客":     { x: W * (narrow ? 0.36 : 0.33), y: H * (narrow ? 0.36 : 0.45),
                      rx: Math.min(W * (narrow ? 0.30 : 0.19), 165), ry: Math.min(H * (narrow ? 0.24 : 0.30), 110) },
        "读书笔记": { x: W * (narrow ? 0.68 : 0.75), y: H * (narrow ? 0.70 : 0.55),
                      rx: Math.min(W * (narrow ? 0.24 : 0.13), 105), ry: Math.min(H * (narrow ? 0.20 : 0.24), 90) }
      };
      CHANNELS.forEach(function (ch) { centers[ch].gr = centers[ch].rx * 1.2; });
      clusters = centers;
      stars = [];
      CHANNELS.forEach(function (ch, ci) {
        var posts = pool.posts.filter(function (p) { return p.s === ch; })
          .slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
        var c = centers[ch];
        var rnd = seeded(ch === "博客" ? 20240511 : 20250720);
        var phase = ci * 1.9;
        posts.forEach(function (p, i) {
          var n = posts.length;
          var t = n > 1 ? i / (n - 1) : 0.5;
          /* 时间沿一条蜿蜒小径流动：相邻两篇在图上也是邻居 */
          var bx = c.x + (t - 0.5) * 2 * c.rx + (rnd() - 0.5) * 9;
          var by = c.y + Math.sin(t * Math.PI * 1.6 + phase) * c.ry * 0.55
                         + (t - 0.5) * c.ry * 0.5 + (rnd() - 0.5) * 9;
          stars.push({
            post: p, ch: ch, idx: i, n: n,
            bx: bx, by: by, x: 0, y: 0,
            size: 1.9 + t * 1.4 + rnd() * 0.5,
            newest: i === n - 1,
            tw: rnd() * Math.PI * 2,
            tws: 0.5 + rnd() * 0.9,
            amp: 1.6 + rnd() * 2.4,
            ph: rnd() * Math.PI * 2,
            depth: 0.5 + rnd() * 0.8,
            hover: 0
          });
        });
      });

      var rndD = seeded(42);
      dust = [];
      var count = Math.round(W * H / 5200);
      for (var i = 0; i < count; i++) {
        dust.push({
          x: rndD() * W, y: rndD() * H,
          r: 0.4 + rndD() * 0.9,
          tw: rndD() * Math.PI * 2,
          tws: 0.3 + rndD() * 0.8,
          vx: (rndD() - 0.5) * 0.05,
          vy: (rndD() - 0.5) * 0.04,
          depth: 0.2 + rndD() * 0.5
        });
      }
    }
    layout();

    /* 状态 */
    var focusChannel = "";
    var motionOn = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var motionBtn = document.getElementById("motion-toggle");
    function syncMotionBtn() {
      motionBtn.textContent = motionOn ? "漂移 开" : "漂移 关";
      motionBtn.setAttribute("aria-pressed", motionOn ? "true" : "false");
    }
    syncMotionBtn();
    motionBtn.addEventListener("click", function () { motionOn = !motionOn; syncMotionBtn(); });

    document.querySelectorAll(".chip[data-channel]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        focusChannel = chip.getAttribute("data-channel");
        document.querySelectorAll(".chip[data-channel]").forEach(function (c) {
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
        hideTip();
      });
    });

    /* 关系层 = 真实 graphify 公开投影；时间层 = 同渠道 chronological 链。
       layout() 会重建星对象，所以每次重排后都要重绑边。 */
    var relEdges = [], timeEdges = [], relAdj = {}, timeAdj = {};
    var edgeMode = "relation";
    function rebuildEdges() {
      var byUrl = {};
      stars.forEach(function (s) { byUrl[s.post.u] = s; });
      relEdges = (pool.links || []).map(function (l) {
        return { a: byUrl[l.a], b: byUrl[l.b], w: l.w, kind: l.kind };
      }).filter(function (e) { return e.a && e.b; });
      relAdj = {};
      relEdges.forEach(function (e) {
        (relAdj[e.a.post.u] = relAdj[e.a.post.u] || []).push(e.b);
        (relAdj[e.b.post.u] = relAdj[e.b.post.u] || []).push(e.a);
      });
      timeEdges = [];
      timeAdj = {};
      CHANNELS.forEach(function (ch) {
        var group = stars.filter(function (s) { return s.ch === ch; });
        for (var k = 0; k < group.length - 1; k++) {
          timeEdges.push({ a: group[k], b: group[k + 1] });
          (timeAdj[group[k].post.u] = timeAdj[group[k].post.u] || []).push(group[k + 1]);
          (timeAdj[group[k + 1].post.u] = timeAdj[group[k + 1].post.u] || []).push(group[k]);
        }
      });
    }
    rebuildEdges();
    document.querySelectorAll(".chip[data-edge]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        edgeMode = chip.getAttribute("data-edge");
        document.querySelectorAll(".chip[data-edge]").forEach(function (c) {
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
      });
    });
    function neighborsOf(s) {
      if (!s) { return null; }
      var list = (edgeMode === "relation" ? relAdj : timeAdj)[s.post.u] || [];
      var set = {};
      set[s.post.u] = true;
      list.forEach(function (n) { set[n.post.u] = true; });
      return set;
    }

    /* 指针：视差 + 命中；触屏两段式（先选中看题，再点打开） */
    var pointer = { x: W / 2, y: H / 2, inside: false };
    var parallax = { x: 0, y: 0 };
    var hovered = null;
    var touchSelected = null;
    var meteor = null;
    var nextMeteor = 5000;

    function starAt(x, y) {
      var best = null, bestD = 15;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (focusChannel && s.ch !== focusChannel) { continue; }
        var dx = s.x - x, dy = s.y - y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }

    function showTip(s) {
      tip.querySelector(".tip-title").textContent = s.post.t;
      var relN = (relAdj[s.post.u] || []).length;
      tip.querySelector(".tip-meta").textContent = s.post.s + " · " + s.post.d
        + (s.newest ? " · 最新" : "")
        + (edgeMode === "relation" && relN ? " · 关联 " + relN + " 篇" : "");
      tip.classList.add("show");
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var tx = s.x + 14, ty = s.y - th - 10;
      if (tx + tw > W - 8) { tx = s.x - tw - 14; }
      if (tx < 8) { tx = 8; }
      if (ty < 8) { ty = s.y + 16; }
      tip.style.left = tx + "px";
      tip.style.top = ty + "px";
    }
    function hideTip() { tip.classList.remove("show"); }

    canvas.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") { return; }
      var rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = true;
      var s = starAt(pointer.x, pointer.y);
      if (s !== hovered) {
        hovered = s;
        canvas.style.cursor = s ? "pointer" : "default";
        if (s) { showTip(s); } else { hideTip(); }
      } else if (s) { showTip(s); }
    });
    canvas.addEventListener("pointerleave", function () {
      pointer.inside = false;
      hovered = null;
      hideTip();
      canvas.style.cursor = "default";
    });
    canvas.addEventListener("pointerdown", function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var s = starAt(x, y);
      if (e.pointerType === "touch") {
        if (!s) { touchSelected = null; hideTip(); return; }
        if (touchSelected === s) {
          window.open(s.post.u, "_blank", "noopener");
        } else {
          touchSelected = s;
          hovered = s;
          showTip(s);
        }
      } else if (s) {
        window.open(s.post.u, "_blank", "noopener");
      }
    });

    /* 渲染：单一 rAF 循环，document.hidden 时只记时间不画 */
    var lastT = performance.now();
    var elapsed = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) { lastT = now; return; }
      var dt = Math.min(50, now - lastT);
      lastT = now;
      if (motionOn) { elapsed += dt; }

      var tx = pointer.inside ? (pointer.x - W / 2) * 0.016 : 0;
      var ty = pointer.inside ? (pointer.y - H / 2) * 0.016 : 0;
      parallax.x += (tx - parallax.x) * 0.06;
      parallax.y += (ty - parallax.y) * 0.06;

      ctx.clearRect(0, 0, W, H);
      var t = elapsed / 1000;

      /* 星簇底光 */
      CHANNELS.forEach(function (ch) {
        var c = clusters[ch];
        if (focusChannel && focusChannel !== ch) { return; }
        var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.gr * 1.4);
        g.addColorStop(0, channelGlow(ch));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(c.x - c.gr * 1.5, c.y - c.gr * 1.5, c.gr * 3, c.gr * 3);
      });

      /* 尘埃 */
      for (var i = 0; i < dust.length; i++) {
        var d = dust[i];
        if (motionOn) {
          d.x += d.vx * dt * 0.06; d.y += d.vy * dt * 0.06;
          if (d.x < -4) { d.x = W + 4; } if (d.x > W + 4) { d.x = -4; }
          if (d.y < -4) { d.y = H + 4; } if (d.y > H + 4) { d.y = -4; }
        }
        var a = 0.16 + 0.14 * Math.sin(t * d.tws + d.tw);
        ctx.globalAlpha = Math.max(0.04, a);
        ctx.fillStyle = palette.dust;
        ctx.beginPath();
        ctx.arc(d.x + parallax.x * d.depth, d.y + parallax.y * d.depth, d.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 星位 */
      for (var j = 0; j < stars.length; j++) {
        var s = stars[j];
        var wob = motionOn ? Math.sin(t * 0.5 * s.tws + s.ph) * s.amp : 0;
        var wob2 = motionOn ? Math.cos(t * 0.4 * s.tws + s.tw) * s.amp * 0.7 : 0;
        s.x = s.bx + wob + parallax.x * s.depth;
        s.y = s.by + wob2 + parallax.y * s.depth;
        var target = (s === hovered || s === touchSelected) ? 1 : 0;
        s.hover += (target - s.hover) * 0.18;
      }

      /* 双层连线：关系层（graphify 投影）+ 时间层（淡轨或亮链） */
      var nb = neighborsOf(hovered || touchSelected);
      function edgeDim(e) {
        return !!(focusChannel && (e.a.ch !== focusChannel || e.b.ch !== focusChannel));
      }
      function strokeEdge(e, alpha, width, curve) {
        var grad = ctx.createLinearGradient(e.a.x, e.a.y, e.b.x, e.b.y);
        grad.addColorStop(0, channelColor(e.a.ch));
        grad.addColorStop(1, channelColor(e.b.ch));
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        if (curve) {
          var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
          var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
          ctx.quadraticCurveTo(mx - dy * 0.14, my + dx * 0.14, e.b.x, e.b.y);
        } else {
          ctx.lineTo(e.b.x, e.b.y);
        }
        ctx.stroke();
      }
      timeEdges.forEach(function (e) {
        var hot = e.a.hover > 0.3 || e.b.hover > 0.3;
        var base = (edgeMode === "time" ? 0.30 : 0.07) * (palette.dark ? 1 : 1.6);
        var alpha = edgeDim(e) ? 0.02 : (hot ? 0.55 : base);
        if (nb && edgeMode === "time" && !(nb[e.a.post.u] && nb[e.b.post.u])) { alpha *= 0.25; }
        strokeEdge(e, alpha, hot ? 1.2 : 0.8, false);
      });
      relEdges.forEach(function (e) {
        var hot = e.a.hover > 0.3 || e.b.hover > 0.3;
        var semantic = e.kind !== "community";
        var base = (edgeMode === "relation" ? (semantic ? 0.42 : 0.30) : 0.06) * (palette.dark ? 1 : 1.6);
        var alpha = edgeDim(e) ? 0.02 : (hot ? 0.85 : base);
        if (nb && edgeMode === "relation" && !(nb[e.a.post.u] && nb[e.b.post.u])) { alpha *= 0.2; }
        strokeEdge(e, alpha, (hot ? 1.5 : 0.9) + Math.min(2, e.w) * 0.18, true);
      });
      ctx.globalAlpha = 1;

      /* 星 */
      for (var m = 0; m < stars.length; m++) {
        var st = stars[m];
        var dimmed = focusChannel && st.ch !== focusChannel;
        var alpha = dimmed ? 0.13 : 1;
        if (nb && !nb[st.post.u]) { alpha *= 0.22; }
        var twinkle = motionOn ? 0.82 + 0.18 * Math.sin(t * st.tws + st.tw) : 1;
        var r = st.size * (1 + st.hover * 0.9) * (st.newest ? 1.25 : 1);
        var col = channelColor(st.ch);

        if (st.newest && !dimmed && (!nb || nb[st.post.u])) {
          ctx.globalAlpha = 0.35 * twinkle;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(st.x, st.y, r + 5 + Math.sin(t * 1.2) * 1.2, 0, 6.2832);
          ctx.stroke();
        }
        if (st.hover > 0.05 && !dimmed) {
          ctx.globalAlpha = 0.22 * st.hover;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(st.x, st.y, r + 8 * st.hover, 0, 6.2832);
          ctx.fill();
        }
        ctx.globalAlpha = alpha * twinkle;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(st.x, st.y, r, 0, 6.2832);
        ctx.fill();
        /* 星芯高光 */
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = palette.card;
        ctx.beginPath();
        ctx.arc(st.x - r * 0.25, st.y - r * 0.25, r * 0.3, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 星簇名 */
      ctx.font = "11px -apple-system, 'PingFang SC', sans-serif";
      ctx.textAlign = "center";
      CHANNELS.forEach(function (ch) {
        var c = clusters[ch];
        var dim = focusChannel && focusChannel !== ch;
        ctx.globalAlpha = dim ? 0.25 : 0.75;
        ctx.fillStyle = palette.muted;
        ctx.fillText(ch + " · " + (counts[ch] || 0) + " 篇", c.x, Math.min(H - 10, c.y + c.ry + 26));
      });
      ctx.globalAlpha = 1;

      /* 流星（低频点缀） */
      if (motionOn) {
        nextMeteor -= dt;
        if (!meteor && nextMeteor <= 0) {
          meteor = { x: W * (0.15 + Math.random() * 0.7), y: -10, vx: -1.4 - Math.random(), vy: 1.1 + Math.random() * 0.7, life: 1 };
          nextMeteor = 8000 + Math.random() * 9000;
        }
        if (meteor) {
          meteor.x += meteor.vx * dt * 0.12;
          meteor.y += meteor.vy * dt * 0.12;
          meteor.life -= dt * 0.0009;
          if (meteor.life <= 0 || meteor.y > H + 20) { meteor = null; }
          else {
            var grad = ctx.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 26, meteor.y - meteor.vy * 26);
            grad.addColorStop(0, palette.dust);
            grad.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = Math.max(0, meteor.life) * 0.5;
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(meteor.x, meteor.y);
            ctx.lineTo(meteor.x - meteor.vx * 26, meteor.y - meteor.vy * 26);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    requestAnimationFrame(frame);

    /* 尺寸变化：重排 + 重绑边 */
    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        layout(); rebuildEdges(); hideTip(); hovered = null; touchSelected = null;
      }, 120);
    }
    if (window.ResizeObserver) {
      new ResizeObserver(onResize).observe(wrap);
    } else {
      window.addEventListener("resize", onResize);
    }
  }

  fetch("data/home.json")
    .then(function (r) {
      if (!r.ok) { throw new Error("home.json HTTP " + r.status); }
      return r.json();
    })
    .then(function (pool) {
      var counts = renderCounts(pool);
      renderQuote(pool);
      renderDraw(pool);
      renderStarmap(pool, counts);
    })
    .catch(function (err) { console.warn("homepage widgets disabled:", err.message); });
}());