/* homepage widgets — 「今日一句」 and 「抽一篇我写的」 (A26).
 *
 * Both read the derived pool site/portal/data/home.json, which
 * scripts/content/portal-data.py builds from topics/** front matter filtered on
 * `status: public`. Nothing here can reach private/: the pool is the only input,
 * and it is generated from published content at build time.
 *
 * Zero dependencies (A7). Rows reuse the 近期文章 markup so they inherit its
 * look and its hover affordance — a widget you are meant to click.
 * No JS or a failed fetch leaves the cards hidden and the static links intact. */
(function () {
  "use strict";

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todaySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  // deterministic per day: every visitor gets the same 「今日一句」
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(n) { return Math.floor(Math.random() * n); }

  // 「」 is the only framing a quote row needs; drop whatever the source used
  function quoteMarks(q) {
    return "「" + q.replace(/^[“”"'‘’「」]+/, "").replace(/[“”"'‘’」]+$/, "") + "」";
  }

  // render one pool item into the single <li><a> row of a widget list
  function fillRow(list, item, meta, text) {
    var a = list.querySelector("a");
    if (!a) { return; }
    a.href = item.u;
    a.querySelector(".title").textContent = text === undefined ? item.t : text;
    a.querySelector("time").textContent = meta;
    list.hidden = false;
  }

  function renderQuote(pool) {
    var card = document.getElementById("today-quote");
    if (!card) { return; }
    var quotes = pool.quotes || [];
    if (!quotes.length) { return; }
    var pick = quotes[Math.floor(mulberry32(todaySeed())() * quotes.length)];
    fillRow(card.querySelector(".quote-list"), pick, "《" + pick.t + "》 · " + pick.d, quoteMarks(pick.q));
    card.hidden = false;
  }

  function renderDraw(pool) {
    var card = document.getElementById("post-draw");
    var button = card && card.querySelector(".draw-button");
    var list = card && card.querySelector(".draw-list");
    var posts = pool.posts || [];
    if (!button || !list || posts.length < 2) { return; }
    var last = -1;
    function draw() {
      var i = randInt(posts.length - 1);
      if (i >= last) { i += 1; }          // skip the previous pick
      last = i;
      var item = posts[i];
      fillRow(list, item, item.s + " · " + item.d);
      button.textContent = "换一篇";
      button.hidden = false;
    }
    button.addEventListener("click", draw);
    draw();                              // never leave the card empty
  }

  fetch("data/home.json")
    .then(function (r) {
      if (!r.ok) { throw new Error("home.json HTTP " + r.status); }
      return r.json();
    })
    .then(function (pool) {
      renderQuote(pool);
      renderDraw(pool);
      document.querySelectorAll(".widget-fallback").forEach(function (el) { el.remove(); });
    })
    .catch(function (err) { console.warn("homepage widgets disabled:", err.message); });
}());
