(() => {
  const $ = (id) => document.getElementById(id);
  const LS_DATA = "fj_data_v1";
  const LS_AUTH = "fj_unlocked";
  const shared = typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG;

  let state = { tabs: [], active: null };
  let db = null, saveTimer = null, applyingRemote = false;

  const uid = () => Math.random().toString(36).slice(2, 9);
  const sha256 = async (t) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");

  /* ---------- Login ---------- */
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("pw").value;
    $("login-error").hidden = true;
    try {
      if (shared) {
        firebase.initializeApp(FIREBASE_CONFIG);
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

  // Stay logged in on refresh
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
      $("sync-status").textContent = "☁️ synced";
      db.onSnapshot((snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (snap.exists) {
          try { state = JSON.parse(snap.data().json); } catch {}
        }
        applyingRemote = true;
        render(true);
        applyingRemote = false;
      });
    } else {
      $("sync-status").textContent = "💾 this device only";
      try { state = JSON.parse(localStorage.getItem(LS_DATA)) || state; } catch {}
      render(true);
    }
  }

  /* ---------- Saving ---------- */
  function save() {
    if (applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const json = JSON.stringify(state);
      if (shared && db) db.set({ json, updated: Date.now() }).catch(() => ($("sync-status").textContent = "⚠️ not saved"));
      else localStorage.setItem(LS_DATA, json);
    }, 500);
  }

  /* ---------- Rendering ---------- */
  const current = () => state.tabs.find((t) => t.id === state.active);

  function render(full) {
    if (!state.tabs.find((t) => t.id === state.active)) state.active = state.tabs[0]?.id ?? null;
    const nav = $("tabs");
    nav.innerHTML = "";
    state.tabs.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "tab" + (t.id === state.active ? " active" : "");
      b.dataset.hue = i % 2;
      b.textContent = t.title || "Untitled list";
      b.onclick = () => { state.active = t.id; render(true); save(); document.body.classList.remove("menu-open"); };
      nav.appendChild(b);
    });
    const t = current();
    $("doc").hidden = !t;
    $("empty").hidden = !!t;
    if (t && full) {
      $("doc-title").value = t.title;
      $("editor").innerHTML = t.html;
    }
  }

  /* ---------- Tab actions ---------- */
  $("new-tab").onclick = () => {
    const t = { id: uid(), title: "", html: "" };
    state.tabs.push(t);
    state.active = t.id;
    render(true); save();
    $("doc-title").focus();
    document.body.classList.remove("menu-open");
  };

  $("delete-tab").onclick = () => {
    const t = current();
    if (!t || !confirm(`Delete "${t.title || "Untitled list"}"? This can't be undone.`)) return;
    state.tabs = state.tabs.filter((x) => x.id !== t.id);
    state.active = null;
    render(true); save();
  };

  $("doc-title").addEventListener("input", (e) => {
    const t = current(); if (!t) return;
    t.title = e.target.value;
    render(false); save();
  });

  $("editor").addEventListener("input", () => {
    const t = current(); if (!t) return;
    t.html = $("editor").innerHTML;
    save();
  });

  /* ---------- Toolbar ---------- */
  document.querySelectorAll(".toolbar [data-cmd]").forEach((b) =>
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      document.execCommand(b.dataset.cmd);
      $("editor").dispatchEvent(new Event("input"));
    })
  );

  $("add-check").addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.execCommand("insertHTML", false, '<div class="todo"><input type="checkbox">&nbsp;</div>');
    $("editor").dispatchEvent(new Event("input"));
  });

  $("color").addEventListener("change", (e) => {
    if (e.target.value) document.execCommand("foreColor", false, e.target.value);
    e.target.value = "";
    $("editor").focus();
    $("editor").dispatchEvent(new Event("input"));
  });

  // Persist checkbox state into the saved HTML
  $("editor").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.toggleAttribute("checked", e.target.checked);
    $("editor").dispatchEvent(new Event("input"));
  });

  $("menu-btn").onclick = () => document.body.classList.toggle("menu-open");
})();
