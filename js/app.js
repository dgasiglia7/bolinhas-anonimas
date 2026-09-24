/* Bolinhas Anônimas: app de página única, sem dependências.
 *
 * Os vídeos publicados ficam em videos.json (no repositório).
 * No modo administrador (abra a página com #/admin uma vez), dá para
 * adicionar, editar e remover vídeos; as mudanças ficam num rascunho local até
 * você tocar em "Publicar", que grava o videos.json pelo GitHub.
 */
(() => {
  "use strict";

  const DEFAULT_REPO = "dgasiglia7/bolinhas-anonimas";
  const DEFAULT_BRANCH = "main";
  const DATA_PATH = "videos.json";

  const KEY = {
    admin: "ba:admin",
    draft: "ba:draft",
    favs: "ba:favs",
    theme: "ba:theme",
    cfg: "ba:cfg",
    menu: "ba:menu",
  };

  // ---------- storage seguro ----------
  const store = {
    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- estado ----------
  const state = {
    published: [],
    draft: store.get(KEY.draft),         // null = sem alterações locais
    favs: new Set(store.get(KEY.favs, [])),
    admin: !!store.get(KEY.admin, false),
    cfg: Object.assign({ repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, token: "" }, store.get(KEY.cfg, {})),
    tag: "Todos",
    loaded: false,
    loadError: false,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const app = $("#app");

  const videos = () => (state.admin && state.draft ? state.draft : state.published);

  // ---------- utilidades ----------
  const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const thumb = (id, q = "hqdefault") => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const s = (t - Date.now()) / 1000;
    const steps = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, sec] of steps) {
      if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
    }
    return "agora mesmo";
  }

  function parseYouTubeId(input) {
    const raw = (input || "").trim();
    if (/^[\w-]{11}$/.test(raw)) return raw;
    let url;
    try { url = new URL(raw.startsWith("http") ? raw : "https://" + raw); } catch { return null; }
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let id = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      id = url.searchParams.get("v");
      if (!id) {
        const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
        if (m) id = m[1];
      }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  const allTags = () => {
    const count = new Map();
    for (const v of videos()) for (const t of v.tags || []) count.set(t, (count.get(t) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([t]) => t);
  };

  const normalize = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function toast(msg, ms = 3200) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), ms);
  }

  const sortByDate = list => [...list].sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0));

  // ---------- dados ----------
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function b64encodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  const ghHeaders = () => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${state.cfg.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const ghContentsUrl = () =>
    `https://api.github.com/repos/${state.cfg.repo}/contents/${DATA_PATH}?ref=${encodeURIComponent(state.cfg.branch)}`;

  async function loadVideos() {
    // No modo admin com token, lê direto do GitHub (sempre atualizado, sem esperar o Pages).
    if (state.admin && state.cfg.token) {
      try {
        const r = await fetch(ghContentsUrl(), { headers: ghHeaders(), cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          return JSON.parse(b64decodeUtf8(j.content)).videos || [];
        }
      } catch {}
    }
    const r = await fetch(DATA_PATH, { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.json()).videos || [];
  }

  function setDraft(list) {
    state.draft = list;
    if (list) store.set(KEY.draft, list); else store.del(KEY.draft);
    updatePending();
  }

  const sig = v => JSON.stringify([v.title, v.channel || "", v.tags || [], v.description || ""]);
  function diffCount() {
    if (!state.draft) return 0;
    const before = new Map(state.published.map(v => [v.id, sig(v)]));
    const after = new Map(state.draft.map(v => [v.id, sig(v)]));
    let n = 0;
    for (const [id, s] of after) if (before.get(id) !== s) n++;   // novos ou editados
    for (const id of before.keys()) if (!after.has(id)) n++;       // removidos
    return n;
  }

  function updatePending() {
    const bar = $("#pendingBar");
    const n = state.admin ? diffCount() : 0;
    if (state.admin && state.draft && n === 0) { state.draft = null; store.del(KEY.draft); }
    bar.hidden = n === 0;
    document.body.classList.toggle("has-pending", n > 0);
    $("#pendingText").textContent = n === 1 ? "1 alteração não publicada" : `${n} alterações não publicadas`;
    if ($("#settingsDialog").open) updateSettingsStatus();
  }

  async function publish() {
    if (!state.draft) return toast("Nada para publicar.");
    if (!state.cfg.token) {
      openSettings();
      return toast("Este navegador ainda não tem a chave de publicação.");
    }
    const btns = [$("#publishBtn"), $("#pubPublishBtn")];
    const labels = btns.map(b => b.innerHTML);
    btns.forEach(b => { b.disabled = true; b.textContent = "Publicando…"; });
    try {
      let sha;
      const cur = await fetch(ghContentsUrl(), { headers: ghHeaders(), cache: "no-store" });
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) throw new Error(await ghError(cur));

      const body = JSON.stringify({ videos: sortByDate(state.draft) }, null, 2) + "\n";
      const n = diffCount();
      const r = await fetch(`https://api.github.com/repos/${state.cfg.repo}/contents/${DATA_PATH}`, {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Atualiza vídeos pela página (${n} ${n === 1 ? "alteração" : "alterações"})`,
          content: b64encodeUtf8(body),
          branch: state.cfg.branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!r.ok) throw new Error(await ghError(r));
      state.published = sortByDate(state.draft);
      setDraft(null);
      render();
      toast("Publicado! O site atualiza para todos em cerca de 1 minuto.", 5000);
    } catch (e) {
      toast("Não consegui publicar: " + e.message, 7000);
    } finally {
      btns.forEach((b, i) => { b.disabled = false; b.innerHTML = labels[i]; });
      updateSettingsStatus();
    }
  }

  async function ghError(r) {
    try {
      const j = await r.json();
      if (r.status === 401) return "chave inválida ou expirada. Crie uma nova em Publicar no site → Chave de publicação.";
      if (r.status === 403) return "a chave não tem permissão para alterar este site (Contents precisa estar em Read and write).";
      if (r.status === 404) return "a chave não dá acesso a este repositório (confira o Repository access), ou o repositório mudou de nome.";
      if (r.status === 409) return "o arquivo mudou no GitHub; recarregue a página e tente de novo.";
      return j.message || "HTTP " + r.status;
    } catch { return "HTTP " + r.status; }
  }

  // ---------- componentes ----------
  function cardHTML(v, { compact = false } = {}) {
    const isNew = state.admin && state.draft && !state.published.some(p => p.id === v.id);
    const tags = (v.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    const meta = [v.channel, ago(v.addedAt)].filter(Boolean).map(esc).join(" • ");
    const menu = state.admin
      ? `<div class="card__menu">
          <button class="icon-btn" data-edit="${esc(v.id)}" aria-label="Editar vídeo" title="Editar vídeo"><span class="ms">edit</span></button>
          <button class="icon-btn" data-remove="${esc(v.id)}" aria-label="Remover vídeo" title="Remover vídeo"><span class="ms">delete</span></button>
        </div>`
      : "";
    return `
      <article class="card ${compact ? "compact" : ""}">
        <a class="card__thumb" href="#/v/${esc(v.id)}" aria-label="${esc(v.title)}">
          <img src="${thumb(v.id, compact ? "mqdefault" : "hqdefault")}" alt="" loading="lazy" onerror="this.remove()">
          ${isNew ? '<span class="card__badge">Não publicado</span>' : ""}
          ${compact ? "" : '<span class="card__play"><span class="ms fill">play_arrow</span>Assistir</span>'}
        </a>
        <div class="card__body">
          ${compact ? "" : '<img class="card__avatar" src="assets/avatar.svg" alt="">'}
          <div class="card__text">
            <a href="#/v/${esc(v.id)}"><h3 class="card__title">${esc(v.title)}</h3></a>
            <div class="card__meta">${meta}</div>
            ${compact || !tags ? "" : `<div class="card__tags">${tags}</div>`}
          </div>
          ${menu}
        </div>
      </article>`;
  }

  function emptyHTML({ icon = "pets", title, text, action = "" }) {
    return `<div class="empty"><div class="empty__art"><span class="ms fill">${icon}</span></div>
      <h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`;
  }

  function channelHTML(active) {
    const n = videos().length;
    return `
      <section class="channel">
        <div class="channel__banner" role="img" aria-label="Padrão de pelagem blue merle">
          <div class="channel__banner-text">border collies<br>blue merle</div>
        </div>
        <div class="channel__info">
          <img class="channel__avatar" src="assets/avatar.svg" alt="">
          <div>
            <h1 class="channel__name">Bolinhas Anônimas</h1>
            <p class="channel__meta">@bolinhasanonimas • ${n} ${n === 1 ? "vídeo" : "vídeos"}</p>
            <p class="channel__desc">Os melhores vídeos de border collie, um por um.</p>
          </div>
        </div>
        <nav class="tabs">
          <a href="#/" class="${active === "home" ? "active" : ""}">Vídeos</a>
          <a href="#/favoritos" class="${active === "favs" ? "active" : ""}">Favoritos</a>
        </nav>
      </section>`;
  }

  function chipsHTML() {
    const tags = allTags();
    if (!tags.length) return "";
    return `<div class="chips" role="tablist">${["Todos", ...tags]
      .map(t => `<button class="chip ${t === state.tag ? "active" : ""}" data-tag="${esc(t)}" role="tab" aria-selected="${t === state.tag}">${esc(t)}</button>`)
      .join("")}</div>`;
  }

  const addAction = () => state.admin
    ? `<button class="btn btn--primary" data-action="add"><span class="ms">add</span>Adicionar vídeo</button>`
    : "";

  // ---------- telas ----------
  function renderHome() {
    const list = sortByDate(videos()).filter(v => state.tag === "Todos" || (v.tags || []).includes(state.tag));
    let body;
    if (!state.loaded) body = `<div class="grid">${skeletons(6)}</div>`;
    else if (state.loadError && !videos().length) body = emptyHTML({ icon: "wifi_off", title: "Não consegui carregar os vídeos", text: location.protocol === "file:"
      ? "Aberto direto do arquivo, o navegador bloqueia a lista de vídeos. Use o abrir-site.cmd da pasta do projeto."
      : "Verifique sua conexão e recarregue a página." });
    else if (!list.length) body = emptyHTML({
      title: "Nenhum vídeo por aqui ainda",
      text: state.admin ? "Cole o link de um vídeo do YouTube para começar." : "Os primeiros vídeos de border collie chegam em breve.",
      action: addAction(),
    });
    else body = `<div class="grid">${list.map(v => cardHTML(v)).join("")}</div>`;
    app.innerHTML = channelHTML("home") + chipsHTML() + body;
  }

  function renderFavs() {
    const list = sortByDate(videos().filter(v => state.favs.has(v.id)));
    app.innerHTML = channelHTML("favs") + (list.length
      ? `<div class="grid" style="margin-top:12px">${list.map(v => cardHTML(v)).join("")}</div>`
      : emptyHTML({ icon: "favorite", title: "Nenhum favorito ainda", text: "Toque em Favoritar num vídeo para guardar ele aqui. Os favoritos ficam salvos neste aparelho." }));
  }

  function renderSearch(q) {
    const nq = normalize(q);
    const list = sortByDate(videos()).filter(v =>
      normalize([v.title, v.channel, v.description, ...(v.tags || [])].join(" ")).includes(nq));
    $("#searchInput").value = q;
    app.innerHTML = `<h2 class="section-title">Resultados para “${esc(q)}”</h2>` + (list.length
      ? `<div class="grid">${list.map(v => cardHTML(v)).join("")}</div>`
      : emptyHTML({ icon: "search_off", title: "Nada encontrado", text: "Tente outra palavra, como filhote, truque ou agility." }));
  }

  function renderWatch(id) {
    const v = videos().find(x => x.id === id);
    const others = sortByDate(videos().filter(x => x.id !== id));
    if (!v && state.loaded) {
      app.innerHTML = emptyHTML({ icon: "videocam_off", title: "Vídeo não encontrado", text: "Talvez ele tenha sido removido.", action: '<a class="btn btn--primary" href="#/">Voltar ao início</a>' });
      return;
    }
    if (!v) { app.innerHTML = ""; return; }
    const fav = state.favs.has(v.id);
    const tags = (v.tags || []).map(t => `<span class="tag">#${esc(t.replace(/\s+/g, ""))}</span>`).join("");
    app.innerHTML = `
      <div class="watch">
        <div class="watch__main">
          <div class="player">
            <iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1"
              title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
          <div class="watch__info">
            <h1 class="watch__title">${esc(v.title)}</h1>
            <div class="watch__row">
              <div class="owner">
                <img src="assets/avatar.svg" alt="">
                <div>
                  <div class="owner__name">Bolinhas Anônimas</div>
                  <div class="owner__sub">${v.channel ? "Original de " + esc(v.channel) : "Border collies blue merle"}</div>
                </div>
              </div>
              <div class="actions">
                <button class="pill ${fav ? "on" : ""}" data-fav="${esc(v.id)}"><span class="ms">favorite</span>${fav ? "Favoritado" : "Favoritar"}</button>
                <button class="pill" data-share="${esc(v.id)}"><span class="ms">share</span>Compartilhar</button>
                <a class="pill pill--red" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener"><span class="ms fill">smart_display</span>YouTube</a>
                ${state.admin ? `<button class="pill" data-edit="${esc(v.id)}"><span class="ms">edit</span>Editar</button>
                <button class="pill" data-remove="${esc(v.id)}"><span class="ms">delete</span>Remover</button>` : ""}
              </div>
            </div>
            <div class="desc">
              <div class="desc__meta">Adicionado ${esc(ago(v.addedAt))}</div>
              <div class="desc__text">${v.description ? esc(v.description) : '<span class="muted">Sem descrição.</span>'}</div>
              ${tags ? `<div class="card__tags">${tags}</div>` : ""}
            </div>
          </div>
        </div>
        <aside class="upnext">
          <h2>A seguir</h2>
          ${others.length
            ? `<div class="grid">${others.map(o => cardHTML(o, { compact: window.matchMedia("(min-width: 600px)").matches })).join("")}</div>`
            : '<p class="muted">Este é o único vídeo por enquanto.</p>'}
        </aside>
      </div>`;
  }

  const skeletons = n => Array.from({ length: n }, () =>
    `<article class="card" aria-hidden="true"><div class="card__thumb"></div><div class="card__body"><div class="card__avatar" style="background:var(--bg-soft)"></div><div class="card__text"><div style="height:16px;background:var(--bg-soft);border-radius:4px;margin-bottom:8px"></div><div style="height:14px;width:60%;background:var(--bg-soft);border-radius:4px"></div></div></div></article>`).join("");

  function renderSideTags() {
    $("#sideTags").innerHTML = allTags().map(t =>
      `<button class="side-link" data-tag="${esc(t)}"><span class="side-tag-dot"></span><span>${esc(t)}</span></button>`).join("")
      || '<p class="side-foot">As categorias aparecem quando houver vídeos.</p>';
    $("#tagList").innerHTML = allTags().map(t => `<option value="${esc(t)}">`).join("");
  }

  // ---------- roteamento ----------
  let lastRoute = "";
  function render() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [route, ...rest] = hash.split("/");
    const arg = rest.join("/");

    document.body.classList.toggle("admin", state.admin);
    $$("[data-nav]").forEach(a => a.classList.toggle("active",
      (a.dataset.nav === "home" && (route === "" || route === "busca")) || (a.dataset.nav === "favs" && route === "favoritos")));
    if (state.tag !== "Todos" && !allTags().includes(state.tag)) state.tag = "Todos";
    renderSideTags();
    updatePending();

    if (route === "v" && arg) {
      document.title = (videos().find(x => x.id === arg)?.title || "Assistindo") + " · Bolinhas Anônimas";
      // não reinicia o player se só a lista ao lado mudou
      const keep = lastRoute === hash ? $(".player") : null;
      renderWatch(arg);
      if (keep) $(".player")?.replaceWith(keep);
    } else if (route === "favoritos") {
      document.title = "Favoritos · Bolinhas Anônimas"; renderFavs();
    } else if (route === "busca" && arg) {
      document.title = `${arg} · Bolinhas Anônimas`; renderSearch(arg);
    } else {
      document.title = "Bolinhas Anônimas"; renderHome();
    }
    if (lastRoute !== hash) window.scrollTo(0, 0);
    lastRoute = hash;
  }

  window.addEventListener("hashchange", () => {
    if (location.hash === "#/admin") return enterAdmin();
    closeMenu();
    render();
  });

  // ---------- admin ----------
  function enterAdmin() {
    state.admin = true;
    store.set(KEY.admin, true);
    history.replaceState(null, "", "#/");
    render();
    toast("Modo administrador ativado neste navegador.");
    load(); // relê do GitHub se houver token
  }

  function exitAdmin() {
    state.admin = false;
    store.del(KEY.admin);
    $("#settingsDialog").close();
    render();
    toast("Você saiu do modo administrador.");
  }

  function removeVideo(id) {
    const v = videos().find(x => x.id === id);
    if (!v || !confirm(`Remover “${v.title}” da página?`)) return;
    setDraft(videos().filter(x => x.id !== id));
    if (location.hash === `#/v/${id}`) location.hash = "#/";
    else render();
    toast("Vídeo removido. Toque em Publicar para aplicar no site.");
  }

  // ---- diálogo de adicionar ----
  const addDlg = $("#addDialog");
  $("#addThumb").addEventListener("error", e => { e.target.style.visibility = "hidden"; });
  $("#addThumb").addEventListener("load", e => { e.target.style.visibility = ""; });
  let metaReq = 0;
  let editingId = null; // id do vídeo em edição; null = adicionando

  function setAddMode(editing) {
    $("#addHeading").textContent = editing ? "Editar vídeo" : "Adicionar vídeo";
    $("#addSubmit").textContent = editing ? "Salvar" : "Adicionar";
    $("#addUrl").readOnly = editing;
  }

  function openAdd() {
    closeMenu();
    editingId = null;
    setAddMode(false);
    $("#addForm").reset();
    $("#addPreview").hidden = true;
    renderTagSuggest();
    addDlg.showModal();
    setTimeout(() => $("#addUrl").focus(), 50);
  }

  function openEdit(id) {
    const v = videos().find(x => x.id === id);
    if (!v) return;
    closeMenu();
    editingId = id;
    setAddMode(true);
    $("#addForm").reset();
    $("#addUrl").value = `https://www.youtube.com/watch?v=${v.id}`;
    $("#addTitle").value = v.title || "";
    $("#addChannel").value = v.channel || "";
    $("#addTags").value = (v.tags || []).join(", ");
    $("#addDesc").value = v.description || "";
    $("#addThumb").src = thumb(v.id, "mqdefault");
    $("#addStatus").textContent = "O link não muda; edite os outros campos.";
    $("#addPreview").hidden = false;
    renderTagSuggest();
    addDlg.showModal();
    setTimeout(() => $("#addTitle").focus(), 50);
  }

  function renderTagSuggest() {
    const base = ["Filhotes", "Truques", "Agility", "Pastoreio", "Brincadeiras", "Blue merle", "Passeios"];
    const tags = [...new Set([...allTags(), ...base])].slice(0, 10);
    $("#tagSuggest").innerHTML = tags.map(t => `<button type="button" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join("");
  }

  async function fetchMeta(id) {
    const url = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
    const sources = [
      `https://www.youtube.com/oembed?format=json&url=${url}`,
      `https://noembed.com/embed?url=${url}`,
    ];
    for (const src of sources) {
      try {
        const r = await fetch(src);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.title) return { title: j.title, channel: j.author_name || "" };
      } catch {}
    }
    return null;
  }

  $("#addUrl").addEventListener("input", async e => {
    const id = parseYouTubeId(e.target.value);
    const prev = $("#addPreview");
    if (!id) { prev.hidden = !e.target.value.trim(); $("#addStatus").textContent = "Link do YouTube não reconhecido."; $("#addThumb").removeAttribute("src"); return; }
    prev.hidden = false;
    $("#addThumb").src = thumb(id, "mqdefault");
    if (videos().some(v => v.id === id)) { $("#addStatus").textContent = "Esse vídeo já está na página."; return; }
    $("#addStatus").textContent = "Buscando título…";
    const req = ++metaReq;
    const meta = await fetchMeta(id);
    if (req !== metaReq) return;
    if (meta) {
      if (!$("#addTitle").value) $("#addTitle").value = meta.title;
      if (!$("#addChannel").value) $("#addChannel").value = meta.channel;
      $("#addStatus").textContent = "Pronto! Confira o título e escolha as categorias.";
    } else {
      $("#addStatus").textContent = "Não consegui buscar o título automaticamente. Digite um abaixo.";
    }
  });

  $("#tagSuggest").addEventListener("click", e => {
    const b = e.target.closest("[data-addtag]");
    if (!b) return;
    const input = $("#addTags");
    const cur = input.value.split(",").map(s => s.trim()).filter(Boolean);
    if (!cur.includes(b.dataset.addtag)) cur.push(b.dataset.addtag);
    input.value = cur.join(", ");
  });

  $("#addForm").addEventListener("submit", e => {
    if (e.submitter?.value !== "add") return;
    if (editingId) {
      const id = editingId;
      editingId = null;
      setDraft(videos().map(v => v.id !== id ? v : {
        ...v,
        title: $("#addTitle").value.trim(),
        channel: $("#addChannel").value.trim(),
        tags: [...new Set($("#addTags").value.split(",").map(s => s.trim()).filter(Boolean))],
        description: $("#addDesc").value.trim(),
      }));
      render();
      toast(state.cfg.token ? "Vídeo atualizado. Toque em Publicar para todos verem." : "Vídeo atualizado (só neste navegador por enquanto).");
      return;
    }
    const id = parseYouTubeId($("#addUrl").value);
    if (!id) { e.preventDefault(); toast("Cole um link válido do YouTube."); return; }
    if (videos().some(v => v.id === id)) { e.preventDefault(); toast("Esse vídeo já está na página."); return; }
    const video = {
      id,
      title: $("#addTitle").value.trim(),
      channel: $("#addChannel").value.trim(),
      tags: [...new Set($("#addTags").value.split(",").map(s => s.trim()).filter(Boolean))],
      description: $("#addDesc").value.trim(),
      addedAt: new Date().toISOString(),
    };
    setDraft([video, ...videos()]);
    state.tag = "Todos";
    if (location.hash !== "#/" && location.hash !== "") location.hash = "#/"; else render();
    toast(state.cfg.token ? "Vídeo adicionado. Toque em Publicar para todos verem." : "Vídeo adicionado (só neste navegador por enquanto).");
  });

  // ---- diálogo de publicação ----
  function openSettings() {
    closeMenu();
    $("#cfgRepo").value = state.cfg.repo;
    $("#cfgBranch").value = state.cfg.branch;
    $("#cfgToken").value = state.cfg.token;
    // Sem chave, já abre a seção da chave; o resto fica recolhido.
    $("#pubKeySection").open = !state.cfg.token;
    updateSettingsStatus();
    $("#settingsDialog").showModal();
  }

  // Mostra no topo do diálogo o que há para publicar e se este navegador tem chave.
  function updateSettingsStatus() {
    const n = state.admin ? diffCount() : 0;
    const hasKey = !!state.cfg.token;
    $("#pubPendingIcon").textContent = n ? "schedule" : "check_circle";
    $("#pubPendingRow").classList.toggle("ok", !n);
    $("#pubPendingText").textContent = n
      ? `${n === 1 ? "1 alteração" : n + " alterações"} só neste navegador, ainda fora do site.`
      : "Nada pendente: o site já mostra o mesmo que você vê aqui.";
    $("#pubKeyIcon").textContent = hasKey ? "key" : "key_off";
    $("#pubKeyRow").classList.toggle("ok", hasKey);
    $("#pubKeyRow").classList.toggle("warn", !hasKey);
    $("#pubKeyText").textContent = hasKey
      ? "Este navegador tem a chave de publicação."
      : "Este navegador ainda não tem a chave de publicação. Configure abaixo ou publique manualmente.";
    $("#pubPublishBtn").disabled = !n || !hasKey;
    $$(".repo-name").forEach(el => el.textContent = state.cfg.repo.split("/")[1] || state.cfg.repo);
    $$(".repo-owner").forEach(el => el.textContent = state.cfg.repo.split("/")[0]);
    $$(".repo-upload").forEach(a => a.href = `https://github.com/${state.cfg.repo}/upload/${encodeURIComponent(state.cfg.branch)}`);
  }

  function saveRepoCfg() {
    state.cfg.repo = $("#cfgRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") || DEFAULT_REPO;
    state.cfg.branch = $("#cfgBranch").value.trim() || DEFAULT_BRANCH;
    store.set(KEY.cfg, state.cfg);
    updateSettingsStatus();
  }
  $("#cfgRepo").addEventListener("change", saveRepoCfg);
  $("#cfgBranch").addEventListener("change", saveRepoCfg);

  // Não deixa o Enter no campo da chave fechar o diálogo.
  $("#settingsForm").addEventListener("submit", e => {
    if (e.submitter?.value !== "cancel") e.preventDefault();
  });
  $("#cfgToken").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#saveTokenBtn").click(); }
  });

  $("#saveTokenBtn").addEventListener("click", async () => {
    const token = $("#cfgToken").value.trim();
    if (!token) return toast("Cole a chave no campo antes de salvar.");
    const btn = $("#saveTokenBtn");
    btn.disabled = true;
    try {
      state.cfg.token = token;
      const r = await fetch(`https://api.github.com/repos/${state.cfg.repo}`, { headers: ghHeaders(), cache: "no-store" });
      if (!r.ok) {
        state.cfg.token = store.get(KEY.cfg, {}).token || "";
        return toast("Chave não salva: " + await ghError(r), 7000);
      }
      store.set(KEY.cfg, state.cfg);
      toast("Chave salva e funcionando neste navegador.");
      $("#pubKeySection").open = false;
      updatePending();
      load(); // relê a lista direto do GitHub
    } catch {
      toast("Não consegui testar a chave. Verifique a internet e tente de novo.", 6000);
    } finally {
      btn.disabled = false;
      updateSettingsStatus();
    }
  });

  $("#clearTokenBtn").addEventListener("click", () => {
    if (!state.cfg.token) return toast("Este navegador não tem chave salva.");
    if (!confirm("Apagar a chave deste navegador? Para publicar daqui de novo será preciso colar a chave outra vez.")) return;
    state.cfg.token = "";
    store.set(KEY.cfg, state.cfg);
    $("#cfgToken").value = "";
    updateSettingsStatus();
    toast("Chave apagada deste navegador.");
  });

  $("#pubPublishBtn").addEventListener("click", publish);

  $("#downloadJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ videos: sortByDate(videos()) }, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "videos.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $("#discardBtn").addEventListener("click", () => {
    if (!state.draft) return toast("Não há alterações locais.");
    if (!confirm("Descartar as alterações que ainda não foram publicadas?")) return;
    setDraft(null);
    render();
    toast("Alterações descartadas.");
  });

  $("#exitAdmin").addEventListener("click", exitAdmin);
  $("#publishBtn").addEventListener("click", publish);

  // ---------- favoritos e compartilhar ----------
  function toggleFav(id) {
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    store.set(KEY.favs, [...state.favs]);
    const on = state.favs.has(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
      b.classList.toggle("on", on);
      b.lastChild.textContent = on ? "Favoritado" : "Favoritar";
    });
    toast(on ? "Adicionado aos favoritos." : "Removido dos favoritos.");
  }

  async function share(id) {
    const v = videos().find(x => x.id === id);
    const url = location.href.split("#")[0] + "#/v/" + id;
    try {
      if (navigator.share) return await navigator.share({ title: v?.title, url });
      await navigator.clipboard.writeText(url);
      toast("Link copiado.");
    } catch {}
  }

  // ---------- eventos globais ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-tag],[data-action],[data-edit],[data-remove],[data-fav],[data-share]");
    if (!t) return;
    if (t.dataset.tag) {
      state.tag = t.dataset.tag;
      closeMenu();
      if (location.hash !== "#/" && location.hash !== "") location.hash = "#/"; else render();
      return;
    }
    if (t.dataset.action === "add") return openAdd();
    if (t.dataset.action === "settings") return openSettings();
    if (t.dataset.edit) { e.preventDefault(); return openEdit(t.dataset.edit); }
    if (t.dataset.remove) { e.preventDefault(); return removeVideo(t.dataset.remove); }
    if (t.dataset.fav) return toggleFav(t.dataset.fav);
    if (t.dataset.share) return share(t.dataset.share);
  });

  $("#createBtn").addEventListener("click", openAdd);
  $("#settingsBtn").addEventListener("click", openSettings);

  // busca
  const openSearch = () => { document.body.classList.add("searching"); $("#searchInput").focus(); };
  $("#searchOpen").addEventListener("click", openSearch);
  $("#bottomSearch").addEventListener("click", () => { window.scrollTo(0, 0); openSearch(); });
  $("#searchBack").addEventListener("click", () => document.body.classList.remove("searching"));
  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("#searchInput").value.trim();
    document.body.classList.remove("searching");
    $("#searchInput").blur();
    location.hash = q ? "#/busca/" + encodeURIComponent(q) : "#/";
  });

  // menu lateral
  const wide = window.matchMedia("(min-width: 1312px)");
  function closeMenu() { if (!wide.matches) document.body.classList.remove("menu-open"); }
  function syncMenu() {
    const pinned = store.get(KEY.menu, true);
    document.body.classList.toggle("menu-pinned", pinned);
    if (!wide.matches) document.body.classList.remove("menu-open");
  }
  $("#menuBtn").addEventListener("click", () => {
    if (wide.matches) {
      const pinned = !document.body.classList.contains("menu-pinned");
      store.set(KEY.menu, pinned);
      document.body.classList.toggle("menu-pinned", pinned);
    } else document.body.classList.toggle("menu-open");
  });
  document.addEventListener("click", e => {
    if (document.body.classList.contains("menu-open") && !wide.matches &&
        !e.target.closest("#sidebar") && !e.target.closest("#menuBtn")) closeMenu();
  });
  wide.addEventListener("change", syncMenu);

  // tema
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    $("#themeBtn .ms").textContent = dark ? "light_mode" : "dark_mode";
  }
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    store.set(KEY.theme, next);
    applyTheme(next);
  });

  // fecha diálogos tocando fora
  $$("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  // ---------- início ----------
  async function load() {
    try {
      state.published = sortByDate(await loadVideos());
      state.loadError = false;
    } catch {
      state.loadError = true;
    }
    state.loaded = true;
    render();
  }

  applyTheme(store.get(KEY.theme));
  syncMenu();
  if (location.hash === "#/admin") enterAdmin();
  else { render(); load(); }
})();
