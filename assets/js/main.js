/* =============================================================================
 *  Zavalon · 个人主页脚本
 *  无依赖，原生 JavaScript。数据优先实时拉取 GitHub API，失败则回退到离线快照。
 * ========================================================================== */
(function () {
  "use strict";

  var C = window.SITE_CONFIG || {};
  var SNAP = window.GITHUB_SNAPSHOT || { user: null, repos: [] };

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var API = "https://api.github.com";
  var LANG_COLORS = C.languageColors || {};
  var R = C.repos || {};

  /* ---------------------------------------------------------------- 工具 -- */

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function langColor(name) {
    return LANG_COLORS[name] || "#8b93a7";
  }

  function relTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso).getTime();
    if (isNaN(d)) return "—";
    var s = Math.max(0, (Date.now() - d) / 1000);
    // [该单位的秒数上限, 单位名, 换算除数]
    var table = [
      [60, "秒", 1],
      [3600, "分钟", 60],
      [86400, "小时", 3600],
      [2592000, "天", 86400],
      [31536000, "个月", 2592000],
      [Infinity, "年", 31536000]
    ];
    for (var i = 0; i < table.length; i++) {
      if (s < table[i][0]) return Math.floor(s / table[i][2]) + " " + table[i][1] + "前";
    }
    return "—";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function daysSince(iso) {
    var d = new Date(iso).getTime();
    if (isNaN(d)) return null;
    return Math.max(1, Math.floor((Date.now() - d) / 86400000));
  }

  var toastTimer;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2200);
  }

  function countUp(el, target, suffix) {
    if (!el) return;
    var end = Number(target) || 0;
    if (reduceMotion || end === 0) { el.textContent = end + (suffix || ""); return; }
    var dur = 900, t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * eased) + (suffix || "");
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* --------------------------------------------------------------- 主题 -- */

  var THEME_KEY = "zavalon-theme";
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f5f6fb" : "#07080d");
  }

  function initTheme() {
    var cfg = C.theme || {};
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var initial = (cfg.rememberChoice !== false && saved) ? saved : (cfg.default || (prefersLight ? "light" : "dark"));
    applyTheme(initial);

    var btn = $("#themeToggle");
    if (btn) btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      if (cfg.rememberChoice !== false) { try { localStorage.setItem(THEME_KEY, next); } catch (e) {} }
      toast(next === "light" ? "已切换到浅色模式" : "已切换到深色模式");
    });
  }

  /* --------------------------------------------------------- 配置渲染 -- */

  function bindConfig() {
    var gh = C.github || "Zava1on";
    var profile = "https://github.com/" + gh;

    $$('[data-bind="name"]').forEach(function (el) { el.textContent = C.name || gh; });
    $$('[data-bind="handle"]').forEach(function (el) { el.textContent = C.handle || gh; });
    $$('[data-bind="intro"]').forEach(function (el) { el.textContent = C.intro || ""; });

    document.title = (C.name || gh) + " · 个人主页";
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute("content", C.intro || ((C.name || gh) + " 的个人主页"));

    ["#navGithub", "#ctaGithub", "#profileLink"].forEach(function (s) {
      var el = $(s); if (el) el.setAttribute("href", profile);
    });
    var ogUrl = $('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", "https://" + gh + ".github.io/");

    // 邮箱
    if (C.email) {
      var mail = $("#ctaMail");
      if (mail) { mail.href = "mailto:" + C.email; mail.hidden = false; }
    }
    // 简历
    if (C.resumeUrl) {
      var res = $("#ctaResume");
      if (res) { res.href = C.resumeUrl; res.hidden = false; }
    }
    // 所在地
    if (C.location) {
      $$('[data-bind="location"]').forEach(function (el) { el.textContent = C.location; });
      var ml = $("#metaLocation"), fl = $("#factLocation");
      if (ml) ml.hidden = false;
      if (fl) fl.hidden = false;
    }
    // 页脚年份
    var y = $("#year"); if (y) y.textContent = new Date().getFullYear();

    renderSocials();
    renderSkills();
    renderPinned();
    renderContact();
  }

  /* --------------------------------------------------------- 图标工具 -- */

  function iconEl(id) {
    return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  var SOCIAL_ICONS = {
    github: "i-github", mail: "i-mail", bilibili: "i-bilibili", zhihu: "i-zhihu",
    x: "i-x", twitter: "i-x", link: "i-link"
  };

  function socialIcon(name) {
    return SOCIAL_ICONS[String(name || "link").toLowerCase()] || "i-link";
  }

  /* ----------------------------------------------------------- 社交链接 -- */

  function socialEntries() {
    var list = [{ label: "GitHub", url: "https://github.com/" + (C.github || ""), icon: "github" }];
    if (C.email) list.push({ label: "Email", url: "mailto:" + C.email, icon: "mail" });
    if (C.resumeUrl) list.push({ label: "简历", url: C.resumeUrl, icon: "link" });
    (C.links || []).forEach(function (l) { if (l && l.url) list.push(l); });
    return list;
  }

  function renderSocials() {
    var box = $("#socials");
    if (!box) return;
    box.innerHTML = socialEntries().map(function (l) {
      return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener" title="' + esc(l.label) +
             '" aria-label="' + esc(l.label) + '">' + iconEl(socialIcon(l.icon)) + "</a></li>";
    }).join("");
  }

  /* --------------------------------------------------------------- 技能 -- */

  function renderSkills() {
    var groups = (C.skills || []).filter(function (g) { return g && g.items && g.items.length; });
    var section = $("#skills"), box = $("#skillGroups");
    if (!box || !section) return;
    if (!groups.length) { section.hidden = true; syncNavVisibility(); return; }

    box.innerHTML = groups.map(function (g) {
      return '<div class="skill-group reveal">' +
        "<h3>" + esc(g.group || "技能") + "</h3>" +
        '<div class="chips">' + g.items.map(function (it) {
          var color = langColor(it);
          return '<span class="chip"><i style="background:' + color + '"></i>' + esc(it) + "</span>";
        }).join("") + "</div></div>";
    }).join("");
    section.hidden = false;
    observeReveals(box);
    syncNavVisibility();
  }

  // 区块被隐藏时，导航里对应的链接也要一起收起来，避免点了没反应
  function syncNavVisibility() {
    $$(".nav__link[data-nav]").forEach(function (a) {
      var target = document.getElementById(a.dataset.nav);
      var hide = !target || target.hidden;
      a.hidden = hide;
      if (hide) a.classList.remove("is-active");
    });
  }

  /* --------------------------------------------------------- 精选作品 -- */

  // 不来自 GitHub 的手动维护作品，展示在项目区最前面
  function renderPinned() {
    var box = $("#pinned");
    if (!box) return;
    var items = (C.pinned || []).filter(function (p) { return p && p.url && p.title; });
    if (!items.length) { box.hidden = true; return; }

    box.innerHTML = items.map(function (p, i) {
      var tag = p.tag ? '<span class="pinned-card__tag">' + esc(p.tag) + "</span>" : "";
      var meta = p.meta ? '<span class="pinned-card__meta">' + esc(p.meta) + "</span>" : "";
      return '<a class="pinned-card reveal" data-delay="' + i * 60 + '" href="' + esc(p.url) + '">' +
        '<span class="pinned-card__icon">' + iconEl(p.icon || "i-spark") + "</span>" +
        '<span class="pinned-card__body">' +
          '<span class="pinned-card__head">' +
            '<span class="pinned-card__title">' + esc(p.title) + "</span>" + tag +
          "</span>" +
          '<span class="pinned-card__desc">' + esc(p.desc) + "</span>" +
          (meta ? '<span class="pinned-card__meta-row">' + meta + "</span>" : "") +
        "</span>" +
        '<span class="pinned-card__go">' + iconEl("i-arrow") + "</span>" +
      "</a>";
    }).join("");
    box.hidden = false;
    observeReveals(box);
  }

  /* --------------------------------------------------------------- 联系 -- */

  function renderContact() {
    var box = $("#contactCards");
    if (!box) return;
    box.innerHTML = socialEntries().map(function (l) {
      var isMail = String(l.url).indexOf("mailto:") === 0;
      var shown = isMail ? String(l.url).replace("mailto:", "") : String(l.url).replace(/^https?:\/\//, "").replace(/\/$/, "");
      return '<a class="contact-card" href="' + esc(l.url) + '"' +
        (isMail ? "" : ' target="_blank" rel="noopener"') + ">" +
        '<span class="contact-card__icon">' + iconEl(socialIcon(l.icon)) + "</span>" +
        '<span class="contact-card__body">' +
          '<span class="contact-card__label">' + esc(l.label) + "</span>" +
          '<span class="contact-card__value">' + esc(shown) + "</span>" +
        "</span>" +
        '<span class="contact-card__go">' + iconEl("i-arrow") + "</span>" +
      "</a>";
    }).join("");
  }

  /* ---------------------------------------------------------- 打字效果 -- */

  function initTypewriter() {
    var el = $("#typewriter");
    var roles = (C.roles || []).filter(Boolean);
    if (!el || !roles.length) return;

    if (reduceMotion) { el.textContent = roles[0]; return; }

    var ri = 0, ci = 0, deleting = false;
    (function tick() {
      var word = roles[ri % roles.length];
      el.textContent = word.slice(0, ci);
      var delay;
      if (!deleting) {
        ci++;
        delay = ci > word.length ? 1600 : 78 + Math.random() * 55;
        if (ci > word.length) deleting = true;
      } else {
        ci--;
        delay = 38;
        if (ci === 0) { deleting = false; ri++; delay = 320; }
      }
      setTimeout(tick, delay);
    })();
  }

  /* ------------------------------------------------------------- 导航 -- */

  function initNav() {
    var nav = $("#nav"), burger = $("#burger"), links = $("#navLinks"), bar = $("#navProgress");

    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (nav) nav.classList.toggle("is-stuck", y > 12);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + "%";
      var top = $("#toTop");
      if (top) top.classList.toggle("is-on", y > 520);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (burger && links) {
      burger.addEventListener("click", function () {
        var open = links.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
      });
      links.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          links.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    }

    // 滚动高亮当前区块
    var sections = $$("main section[id]").filter(function (s) { return !s.hidden; });
    var navLinks = $$(".nav__link[data-nav]");
    if ("IntersectionObserver" in window && sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id;
          navLinks.forEach(function (a) { a.classList.toggle("is-active", a.dataset.nav === id); });
        });
      }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
      sections.forEach(function (s) { io.observe(s); });
    }
  }

  function initToTop() {
    var btn = $("#toTop");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* --------------------------------------------------------- 出现动画 -- */

  var revealIO = null;
  function observeReveals(root) {
    var items = $$(".reveal", root || document);
    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          var d = parseInt(el.dataset.delay || "0", 10);
          setTimeout(function () { el.classList.add("is-in"); }, d);
          obs.unobserve(el);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    }
    items.forEach(function (el) { if (!el.classList.contains("is-in")) revealIO.observe(el); });
  }

  /* ------------------------------------------------------- GitHub 数据 -- */

  function fetchJSON(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctl = "AbortController" in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error("timeout")); }, ms || 7000);
      fetch(url, {
        headers: { Accept: "application/vnd.github+json" },
        signal: ctl ? ctl.signal : undefined,
        cache: "no-store"
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      }).then(function (data) {
        clearTimeout(timer); resolve(data);
      }).catch(function (err) {
        clearTimeout(timer); reject(err);
      });
    });
  }

  function setSource(kind) {
    var el = $("#dataSource");
    if (!el) return;
    el.classList.remove("is-cached", "is-error");
    if (kind === "live") { el.textContent = "实时同步"; }
    else if (kind === "cached") { el.classList.add("is-cached"); el.textContent = "离线快照"; }
    else { el.classList.add("is-error"); el.textContent = "数据不可用"; }
  }

  function loadData() {
    var gh = C.github || "Zava1on";
    var limit = (R.apiLimit || 100);
    return Promise.all([
      fetchJSON(API + "/users/" + gh, 7000),
      fetchJSON(API + "/users/" + gh + "/repos?per_page=" + limit + "&sort=pushed", 8000)
    ]).then(function (out) {
      setSource("live");
      return { user: out[0], repos: out[1] || [], live: true };
    }).catch(function () {
      if (SNAP && SNAP.user) { setSource("cached"); return { user: SNAP.user, repos: SNAP.repos || [], live: false }; }
      setSource("error");
      return { user: null, repos: [], live: false };
    });
  }

  /* --------------------------------------------------------- 渲染数据 -- */

  function renderUser(user) {
    if (!user) {
      $("#metaJoined") && ($("#metaJoined").hidden = true);
      return;
    }

    if (user.avatar_url) {
      var img = $("#avatar");
      if (img) { img.src = user.avatar_url; img.alt = (user.name || user.login) + " 的头像"; }
    }
    if (user.name && !C.name) $$('[data-bind="name"]').forEach(function (el) { el.textContent = user.name; });

    var bio = $("#ghBio");
    if (bio && user.bio) { bio.textContent = user.bio; bio.hidden = false; }

    var repos = Number(user.public_repos) || 0;
    var followers = Number(user.followers) || 0;
    var following = Number(user.following) || 0;

    // 同一个数字可能出现在首屏小卡片和「关于」列表里，两处都要更新
    function setStat(key, value) {
      var nodes = $$('[data-mini="' + key + '"]');
      nodes.forEach(function (el, i) { i === 0 ? countUp(el, value) : (el.textContent = value); });
    }
    setStat("repos", repos);
    setStat("followers", followers);
    setStat("following", following);

    var joined = daysSince(user.created_at);
    if (joined) {
      var j = $('[data-bind="joined"]');
      if (j) j.textContent = "第 " + joined + " 天";
      var mj = $("#metaJoined");
      if (mj) mj.hidden = false;
    }
    var js = $('[data-bind="joinedShort"]');
    if (js) js.textContent = fmtDate(user.created_at);
  }

  function pickRepos(list) {
    var out = (list || []).filter(function (r) {
      if (!r) return false;
      if (!R.showForks && r.fork) return false;
      if ((R.exclude || []).indexOf(r.name) !== -1) return false;
      return true;
    });

    var featured = R.featured || [];
    var rank = function (r) {
      var i = featured.indexOf(r.name);
      return i === -1 ? 999 : i;
    };
    return out;
  }

  function sortRepos(list, mode) {
    var arr = list.slice();
    if (mode === "stars") {
      arr.sort(function (a, b) { return (b.stargazers_count || 0) - (a.stargazers_count || 0) || ts(b) - ts(a); });
    } else if (mode === "name") {
      arr.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "zh-Hans-CN"); });
    } else {
      arr.sort(function (a, b) { return ts(b) - ts(a); });
    }
    function ts(r) { return new Date(r.pushed_at || r.updated_at || 0).getTime() || 0; }
    return arr;
  }

  function orderWithFeatured(list) {
    var featured = R.featured || [];
    if (!featured.length) return list;
    var head = [], tail = [];
    list.forEach(function (r) { (featured.indexOf(r.name) !== -1 ? head : tail).push(r); });
    head.sort(function (a, b) { return featured.indexOf(a.name) - featured.indexOf(b.name); });
    return head.concat(tail);
  }

  function repoCard(r) {
    var isFeatured = (R.featured || []).indexOf(r.name) !== -1;
    var lang = r.language;
    var desc = r.description || "";
    var meta = [];

    if (lang) {
      meta.push('<span class="repo__lang"><i style="background:' + langColor(lang) + '"></i>' + esc(lang) + "</span>");
    }
    meta.push("<span>" + iconEl("i-star") + (r.stargazers_count || 0) + "</span>");
    meta.push("<span>" + iconEl("i-fork") + (r.forks_count || 0) + "</span>");
    if (r.license && r.license.spdx_id && r.license.spdx_id !== "NOASSERTION") {
      meta.push("<span>" + iconEl("i-scale") + esc(r.license.spdx_id) + "</span>");
    }
    meta.push('<span class="repo__updated">' + relTime(r.pushed_at || r.updated_at) + "</span>");

    var topics = (r.topics || []).slice(0, 4);
    var topicsHtml = topics.length
      ? '<div class="repo__topics">' + topics.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>"
      : "";

    return '<article class="repo reveal">' +
      '<div class="repo__head">' +
        '<span class="repo__icon">' + iconEl("i-code") + "</span>" +
        '<h3 class="repo__name"><a href="' + esc(r.html_url) + '" target="_blank" rel="noopener">' +
          esc(r.name) + iconEl("i-arrow") + "</a></h3>" +
        (isFeatured ? '<span class="repo__pin">置顶</span>' : "") +
      "</div>" +
      '<p class="repo__desc' + (desc ? "" : " is-empty") + '">' + (desc ? esc(desc) : "还没有写简介") + "</p>" +
      topicsHtml +
      '<div class="repo__meta">' + meta.join("") + "</div>" +
    "</article>";
  }

  function renderRepos(list, mode) {
    var box = $("#repos"), empty = $("#reposEmpty");
    if (!box) return;

    var picked = orderWithFeatured(sortRepos(pickRepos(list), mode));
    var max = R.max || 9;
    var shown = picked.slice(0, max);

    box.setAttribute("aria-busy", "false");

    if (!shown.length) {
      box.innerHTML = "";
      box.hidden = true;
      if (empty) empty.hidden = false;
    } else {
      box.hidden = false;
      if (empty) empty.hidden = true;
      box.innerHTML = shown.map(repoCard).join("");
      attachCardGlow(box);
    }
    observeReveals(box);

    // 需要「更多」提示
    var right = $(".repo-toolbar__right .link-arrow");
    if (right && picked.length > shown.length) {
      right.innerHTML = "还有 " + (picked.length - shown.length) + " 个仓库 " + iconEl("i-arrow");
    }
  }

  function attachCardGlow(root) {
    $$(".repo", root).forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
      });
    });
  }

  function renderLanguages(list) {
    var bar = $("#langbar"), barEl = $("#langbarBar"), legend = $("#langbarLegend"), hint = $("#langbarHint");
    if (!bar || !barEl || !legend) return;

    var totals = {}, sum = 0;
    (list || []).forEach(function (r) {
      if (!r || r.fork || !r.language) return;
      var w = Math.max(1, Number(r.size) || 1);
      totals[r.language] = (totals[r.language] || 0) + w;
      sum += w;
    });

    var rows = Object.keys(totals).map(function (k) { return { name: k, value: totals[k] }; })
      .sort(function (a, b) { return b.value - a.value; });

    if (!rows.length || sum === 0) { bar.hidden = true; return; }

    var top = rows.slice(0, 6);
    var restVal = rows.slice(6).reduce(function (a, b) { return a + b.value; }, 0);
    if (restVal > 0) top.push({ name: "其他", value: restVal });

    barEl.innerHTML = top.map(function (r) {
      var pct = (r.value / sum) * 100;
      var color = r.name === "其他" ? "#8b93a7" : langColor(r.name);
      return '<span style="width:' + pct.toFixed(2) + "%;background:" + color + '" title="' +
             esc(r.name) + " " + pct.toFixed(1) + '%"></span>';
    }).join("");

    legend.innerHTML = top.map(function (r) {
      var pct = (r.value / sum) * 100;
      var color = r.name === "其他" ? "#8b93a7" : langColor(r.name);
      return '<li><i style="background:' + color + '"></i>' + esc(r.name) +
             " <b>" + pct.toFixed(1) + "%</b></li>";
    }).join("");

    if (hint) hint.textContent = "按仓库体量估算 · " + rows.length + " 种语言";
    bar.hidden = false;
  }

  /* --------------------------------------------------------------- 启动 -- */

  function initSortTabs(getList) {
    var btns = $$(".seg__btn");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (o) {
          var on = o === b;
          o.classList.toggle("is-active", on);
          o.setAttribute("aria-selected", String(on));
        });
        renderRepos(getList(), b.dataset.sort);
        observeReveals($("#repos"));
      });
    });
  }

  // 只在本地预览（localhost / file://）时显示「去 config.js 改这里」的提示
  function showLocalHints() {
    var isLocal = location.protocol === "file:" ||
                  /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
    if (!isLocal) return;
    var note = $("#aboutNote");
    if (note) note.hidden = false;
  }

  function init() {
    initTheme();
    bindConfig();
    showLocalHints();
    initTypewriter();
    initNav();
    initToTop();
    observeReveals(document);

    // 头像加载失败 → 显示首字母
    var img = $("#avatar"), box = $("#avatarBox");
    if (img && box) {
      img.addEventListener("error", function () { box.classList.add("is-fallback"); });
      if (img.complete && img.naturalWidth === 0) box.classList.add("is-fallback");
    }

    var current = { user: null, repos: [] };
    initSortTabs(function () { return current.repos; });

    loadData().then(function (data) {
      current = data;
      renderUser(data.user);
      renderRepos(data.repos, "pushed");
      renderLanguages(data.repos);
      var j = $('[data-bind="joined"]');
      if (j) observeReveals(document);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
