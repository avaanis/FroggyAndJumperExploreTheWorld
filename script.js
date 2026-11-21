(() => {
  const $ = (id) => document.getElementById(id);
  const LS_DATA = "fj_data_v1", LS_AUTH = "fj_unlocked", LS_THEME = "fj_theme", LS_WHO = "fj_who";
  const shared = typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG;

  let state = { tabs: [], active: null, seeded: false };
  let db = null, saveTimer = null, dirty = false, lastStamp = 0, applyingRemote = false;
  let renderedEmbed = null, pendingRange = null, activeCid = null, dragFrom = null;

  const uid = () => Math.random().toString(36).slice(2, 9);
  const norm = (s) => s.trim().toLowerCase();
  const sha256 = async (t) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  const current = () => state.tabs.find((t) => t.id === state.active);
  const setStatus = (m) => ($("sync-status").textContent = m);

  /* ---------- Theme ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(LS_THEME, t);
    $("theme-toggle").textContent = t === "dark" ? "Light mode" : "Dark mode";
  }
  setTheme(document.documentElement.getAttribute("data-theme"));
  $("theme-toggle").onclick = () =>
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

  /* ---------- Login ---------- */
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = norm($("pw").value);
    $("login-error").hidden = true;
    try {
      if (shared) {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        await firebase.auth().signInWithEmailAndPassword(SHARED_EMAIL, pw);
      } else if ((await sha256(pw)) !== PASSWORD_HASH) {
        throw new Error("bad password");
      } else {
        sessionStorage.setItem(LS_AUTH, "1");
      }
      start();
    } catch (err) {
      $("login-error").hidden = false;
      $("pw").select();
    }
  });

  $("logout").addEventListener("click", async () => {
    flush();
    sessionStorage.removeItem(LS_AUTH);
    if (shared && firebase.apps.length) await firebase.auth().signOut();
    location.reload();
  });

  /* ---------- Start ---------- */
  let started = false;
  function start() {
    if (started) return;
    started = true;
    $("login").hidden = true;
    $("app").hidden = false;
    $("pw").value = "";
    $("who").value = localStorage.getItem(LS_WHO) || "Jumper";

    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_DATA)); } catch {}

    if (shared) {
      db = firebase.firestore().collection("froggy-jumper").doc("lists");
      db.onSnapshot((snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const d = snap.exists ? snap.data() : null;
        if (d && d.updated === lastStamp) return; // our own write coming back
        if (dirty) return;                        // unsent local edits win
        if (d) { try { state = JSON.parse(d.json); } catch {} }
        else if (local) state = local;
        seedIfNeeded();
        applyingRemote = true;
        render(true);
        applyingRemote = false;
        setStatus("Saved");
      });
    } else {
      if (local) state = local;
      seedIfNeeded();
      render(true);
      setStatus("Saved");
    }
  }

  // First run: put the joint playlist in its own tab
  function seedIfNeeded() {
    if (state.seeded) return;
    state.seeded = true;
    state.tabs.unshift({
      id: uid(), title: "Our Playlist", embed: SEED_PLAYLIST, comments: [],
      html: "<p>Songs that belong to us. Add notes, memories or song dedications below.</p>"
    });
    if (!state.active) state.active = state.tabs[0].id;
    save();
  }

  /* ---------- Saving: every change is written straight away ---------- */
  function save() {
    if (applyingRemote) return;
    try { localStorage.setItem(LS_DATA, JSON.stringify(state)); } catch {}
    if (!(shared && db)) { setStatus("Saved"); return; }
    dirty = true;
    setStatus("Saving...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }

  function flush() {
    clearTimeout(saveTimer);
    if (!dirty || !(shared && db)) return;
    dirty = false;
    lastStamp = Date.now();
    db.set({ json: JSON.stringify(state), updated: lastStamp })
      .then(() => { if (!dirty) setStatus("Saved"); })
      .catch(() => setStatus("Not saved, check connection"));
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  /* ---------- Spotify embed ---------- */
  function embedUrl(link) {
    const m = (link || "").match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
  }

  function renderEmbed(t) {
    const wrap = $("embed-wrap");
    const src = t && t.embed ? embedUrl(t.embed) : null;
    if (src === renderedEmbed) return;
    renderedEmbed = src;
    wrap.innerHTML = "";
    wrap.hidden = !src;
    if (!src) return;
    const f = document.createElement("iframe");
    f.src = src;
    f.height = src.includes("/playlist/") || src.includes("/album/") ? 352 : 152;
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.loading = "lazy";
    wrap.appendChild(f);
  }

  /* ---------- Rendering ---------- */
  function render(full) {
    if (!current()) state.active = state.tabs[0]?.id ?? null;
    renderTabs();
    const t = current();
    $("sheet").hidden = !t;
    $("empty").hidden = !!t;
    $("delete-tab").disabled = !t;
    if (t && full) {
      $("doc-title").value = t.title;
      $("editor").innerHTML = t.html;
      pendingRange = null; activeCid = null;
      $("composer").hidden = true;
      renderedEmbed = undefined;
      renderEmbed(t);
      renderComments();
    }
    if (!t) { renderedEmbed = undefined; renderEmbed(null); }
  }

  function renderTabs() {
    const nav = $("tabs");
    nav.innerHTML = "";
    state.tabs.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "tab-row" + (t.id === state.active ? " active" : "");
      row.draggable = true;

      const b = document.createElement("button");
      b.className = "tab";
      b.textContent = t.title || "Untitled";
      b.onclick = () => { state.active = t.id; render(true); save(); document.body.classList.remove("menu-open"); };
      row.appendChild(b);

      if (t.id === state.active) {
        const mv = document.createElement("span");
        mv.className = "mv";
        [["Move up", "\u2191", -1], ["Move down", "\u2193", 1]].forEach(([title, ch, d]) => {
          const m = document.createElement("button");
          m.title = title; m.textContent = ch;
          m.disabled = i + d < 0 || i + d >= state.tabs.length;
          m.onclick = (e) => { e.stopPropagation(); moveTab(i, i + d); };
          mv.appendChild(m);
        });
        row.appendChild(mv);
      }

      row.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); });
      row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("over"); });
      row.addEventListener("dragleave", () => row.classList.remove("over"));
      row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("over"); if (dragFrom !== null) moveTab(dragFrom, i); dragFrom = null; });
      row.addEventListener("dragend", () => { dragFrom = null; renderTabs(); });
      nav.appendChild(row);
    });
  }

  function moveTab(from, to) {
    if (from === to || to < 0 || to >= state.tabs.length) return;
    state.tabs.splice(to, 0, state.tabs.splice(from, 1)[0]);
    renderTabs(); save();
  }

  /* ---------- Tab actions ---------- */
  $("new-tab").onclick = () => {
    const t = { id: uid(), title: "", html: "", embed: "", comments: [] };
    state.tabs.push(t);
    state.active = t.id;
    render(true); save();
    $("doc-title").focus();
    document.body.classList.remove("menu-open");
  };

  $("delete-tab").onclick = () => {
    const t = current();
    if (!t || !confirm(`Delete "${t.title || "Untitled"}"? This cannot be undone.`)) return;
    state.tabs = state.tabs.filter((x) => x.id !== t.id);
    state.active = null;
    render(true); save();
  };

  $("doc-title").addEventListener("input", (e) => {
    const t = current(); if (!t) return;
    t.title = e.target.value;
    renderTabs(); save();
  });

  function sync() {
    const t = current(); if (!t) return;
    t.html = $("editor").innerHTML;
    const before = (t.comments || []).length;
    t.comments = (t.comments || []).filter((c) => $("editor").querySelector(`.cmt[data-cid="${c.id}"]`));
    if (t.comments.length !== before) renderComments();
    save();
  }
  $("editor").addEventListener("input", sync);

  /* ---------- Toolbar ---------- */
  document.querySelectorAll("#toolbar [data-cmd]").forEach((b) =>
    b.addEventListener("mousedown", (e) => { e.preventDefault(); document.execCommand(b.dataset.cmd); sync(); })
  );

  $("add-check").addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.execCommand("insertHTML", false, '<div class="todo"><input type="checkbox">&nbsp;</div>');
    sync();
  });

  $("block").addEventListener("change", (e) => {
    $("editor").focus();
    document.execCommand("formatBlock", false, e.target.value);
    sync();
  });

  $("color").addEventListener("change", (e) => {
    $("editor").focus();
    const v = e.target.value;
    if (v === "default") document.execCommand("removeFormat");
    else if (v) document.execCommand("foreColor", false, v);
    e.target.value = "";
    sync();
  });

  const HL = { red: "rgba(214,88,106,0.38)", purple: "rgba(124,92,196,0.38)", none: "transparent" };
  document.querySelectorAll("[data-hl]").forEach((b) =>
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("hiliteColor", false, HL[b.dataset.hl]);
      sync();
    })
  );

  $("editor").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.toggleAttribute("checked", e.target.checked);
    sync();
  });

  /* ---------- Comments ---------- */
  $("add-comment").addEventListener("mousedown", (e) => {
    e.preventDefault();
    const t = current(); if (!t) return;
    const sel = getSelection();
    const ed = $("editor");
    if (!sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode) || !ed.contains(sel.focusNode)) {
      alert("Select some text first, then click Comment.");
      return;
    }
    const r = sel.getRangeAt(0);
    if (r.cloneContents().querySelector("div,p,li,ul,ol,h2,h3")) {
      alert("Please select text within a single line or paragraph.");
      return;
    }
    pendingRange = r.cloneRange();
    $("comments").hidden = false;
    $("composer").hidden = false;
    $("comment-text").value = "";
    $("comment-text").focus();
  });

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("comment-text").value.trim();
    const t = current();
    if (!text || !pendingRange || !t) return;
    const id = uid();
    const span = document.createElement("span");
    span.className = "cmt";
    span.dataset.cid = id;
    span.appendChild(pendingRange.extractContents());
    pendingRange.insertNode(span);
    (t.comments = t.comments || []).push({ id, text, who: $("who").value, time: Date.now() });
    localStorage.setItem(LS_WHO, $("who").value);
    pendingRange = null;
    $("composer").hidden = true;
    activeCid = id;
    sync();
    renderComments();
  });

  $("comment-cancel").onclick = () => { pendingRange = null; $("composer").hidden = true; renderComments(); };

  function renderComments() {
    const t = current();
    const list = $("comment-list");
    list.innerHTML = "";
    const items = t ? (t.comments || []).filter((c) => $("editor").querySelector(`.cmt[data-cid="${c.id}"]`)) : [];
    $("comments").hidden = !items.length && $("composer").hidden;

    items.forEach((c) => {
      const card = document.createElement("div");
      card.className = "comment" + (c.id === activeCid ? " active" : "");
      const head = document.createElement("div");
      head.className = "chead";
      const who = document.createElement("strong");
      who.textContent = c.who || "";
      const when = document.createElement("span");
      when.textContent = new Date(c.time).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      head.append(who, when);
      const body = document.createElement("p");
      body.textContent = c.text;
      const res = document.createElement("button");
      res.className = "small";
      res.textContent = "Resolve";
      res.onclick = (e) => {
        e.stopPropagation();
        const s = $("editor").querySelector(`.cmt[data-cid="${c.id}"]`);
        if (s) { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); $("editor").normalize(); }
        t.comments = t.comments.filter((x) => x.id !== c.id);
        if (activeCid === c.id) activeCid = null;
        sync(); renderComments();
      };
      card.append(head, body, res);
      card.onclick = () => {
        activeCid = c.id;
        const s = $("editor").querySelector(`.cmt[data-cid="${c.id}"]`);
        if (s) s.scrollIntoView({ block: "center", behavior: "smooth" });
        renderComments();
      };
      list.appendChild(card);
    });

    let st = $("active-style");
    if (!st) { st = document.createElement("style"); st.id = "active-style"; document.head.appendChild(st); }
    st.textContent = activeCid ? `.cmt[data-cid="${activeCid}"]{background:var(--cmt-active) !important}` : "";
  }

  $("editor").addEventListener("click", (e) => {
    const c = e.target.closest && e.target.closest(".cmt");
    const next = c ? c.dataset.cid : null;
    if (next !== activeCid) { activeCid = next; renderComments(); }
  });

  $("menu-btn").onclick = () => document.body.classList.toggle("menu-open");

  /* ---------- Stay logged in on refresh (kept last so everything above exists) ---------- */
  if (shared) {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged((u) => { if (u) start(); });
  } else if (sessionStorage.getItem(LS_AUTH)) {
    start();
  }
})();
