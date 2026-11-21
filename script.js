(() => {
  const $ = (id) => document.getElementById(id);
  const LS_DATA = "fj_data_v1";
  const LS_AUTH = "fj_unlocked";
  const LS_THEME = "fj_theme";
  const shared = typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG;

  let state = { tabs: [], active: null, seeded: false };
  let db = null, saveTimer = null, applyingRemote = false;
  let renderedEmbed = null;

  const uid = () => Math.random().toString(36).slice(2, 9);
  const norm = (s) => s.trim().toLowerCase();
  const sha256 = async (t) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");

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
    sessionStorage.removeItem(LS_AUTH);
    if (shared && firebase.apps.length) await firebase.auth().signOut();
    location.reload();
  });

  if (shared) {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged((u) => { if (u) start(); });
  } else if (sessionStorage.getItem(LS_AUTH)) {
    start();
  }

  /* ---------- Start ---------- */
  let started = false;
  function start() {
    if (started) return;
    started = true;
    $("login").hidden = true;
    $("app").hidden = false;
    $("pw").value = "";

    if (shared) {
      db = firebase.firestore().collection("froggy-jumper").doc("lists");
      $("sync-status").textContent = "Synced";
      db.onSnapshot((snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (snap.exists) { try { state = JSON.parse(snap.data().json); } catch {} }
        seedIfNeeded();
        applyingRemote = true;
        render(true);
        applyingRemote = false;
      });
    } else {
      $("sync-status").textContent = "Saved on this device";
      try { state = JSON.parse(localStorage.getItem(LS_DATA)) || state; } catch {}
      seedIfNeeded();
      render(true);
    }
  }

  // First run: put the joint playlist in its own tab
  function seedIfNeeded() {
    if (state.seeded) return;
    state.seeded = true;
    state.tabs.unshift({
      id: uid(), title: "Our Playlist", embed: SEED_PLAYLIST,
      html: "<p>Songs that belong to us. Add notes, memories or song dedications below.</p>"
    });
    if (!state.active) state.active = state.tabs[0].id;
    save();
  }

  /* ---------- Saving ---------- */
  function save() {
    if (applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const json = JSON.stringify(state);
      if (shared && db) db.set({ json, updated: Date.now() }).catch(() => ($("sync-status").textContent = "Not saved"));
      else localStorage.setItem(LS_DATA, json);
    }, 500);
  }

  /* ---------- Spotify ---------- */
  function embedUrl(link) {
    const m = (link || "").match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
  }

  function renderEmbed(t) {
    const wrap = $("embed-wrap");
    const src = t && t.embed ? embedUrl(t.embed) : null;
    if (src === renderedEmbed) return; // do not reload an already-loaded player
    renderedEmbed = src;
    wrap.innerHTML = "";
    wrap.hidden = !src;
    if (!src) return;
    const f = document.createElement("iframe");
    f.src = src;
    f.height = src.includes("/playlist/") || src.includes("/album/") ? 352 : 152;
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.loading = "lazy";
    const rm = document.createElement("button");
    rm.className = "flat small";
    rm.textContent = "Remove player";
    rm.onclick = () => { t.embed = ""; renderEmbed(t); save(); };
    wrap.append(f, rm);
  }

  $("add-embed").onclick = () => {
    const t = current(); if (!t) return;
    const link = prompt("Paste a Spotify playlist, album or song link:");
    if (!link) return;
    if (!embedUrl(link)) { alert("That doesn't look like a Spotify link."); return; }
    t.embed = link;
    renderEmbed(t); save();
  };

  /* ---------- Rendering ---------- */
  const current = () => state.tabs.find((t) => t.id === state.active);

  function render(full) {
    if (!current()) state.active = state.tabs[0]?.id ?? null;
    const nav = $("tabs");
    nav.innerHTML = "";
    state.tabs.forEach((t) => {
      const b = document.createElement("button");
      b.className = "tab" + (t.id === state.active ? " active" : "");
      b.textContent = t.title || "Untitled";
      b.onclick = () => { state.active = t.id; render(true); save(); document.body.classList.remove("menu-open"); };
      nav.appendChild(b);
    });
    const t = current();
    $("page").hidden = !t;
    $("empty").hidden = !!t;
    $("delete-tab").disabled = !t;
    if (t && full) {
      $("doc-title").value = t.title;
      $("editor").innerHTML = t.html;
      renderedEmbed = undefined;
      renderEmbed(t);
    }
    if (!t) { renderedEmbed = undefined; renderEmbed(null); }
  }

  /* ---------- Tab actions ---------- */
  $("new-tab").onclick = () => {
    const t = { id: uid(), title: "", html: "", embed: "" };
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
    render(false); save();
  });

  const sync = () => { const t = current(); if (t) { t.html = $("editor").innerHTML; save(); } };
  $("editor").addEventListener("input", sync);

  /* ---------- Toolbar ---------- */
  document.querySelectorAll("#toolbar [data-cmd]").forEach((b) =>
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      document.execCommand(b.dataset.cmd);
      sync();
    })
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

  // Keep checkbox state in the saved HTML
  $("editor").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.toggleAttribute("checked", e.target.checked);
    sync();
  });

  $("menu-btn").onclick = () => document.body.classList.toggle("menu-open");
})();
