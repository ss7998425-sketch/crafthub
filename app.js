(() => {
  "use strict";
  const API = "https://api.modrinth.com/v2";
  const PAGE_SIZE = 18;
  const state = { type: "mod", query: "", sort: "relevance", page: 0, total: 0, loading: false };
  const $ = (id) => document.getElementById(id);
  const grid = $("projectGrid"), status = $("status");

  const typeNames = { mod: "Mods", plugin: "Plugins", resourcepack: "Resource Packs" };
  const number = (n) => new Intl.NumberFormat("en", { notation: n >= 1000000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);

  function setStatus(message, kind = "") {
    status.className = "status " + kind;
    status.innerHTML = message;
    status.hidden = !message;
  }

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  function syncTabs() {
    document.querySelectorAll("[data-type]").forEach(button => {
      button.classList.toggle("active", button.classList.contains("nav-link") && button.dataset.type === state.type);
      button.classList.toggle("selected", button.classList.contains("filter-chip") && button.dataset.type === state.type);
    });
    $("sectionTitle").textContent = (state.query ? "Search results" : "Popular ") + typeNames[state.type];
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      let detail = "";
      try { const body = await response.json(); detail = body.description || body.error || ""; } catch (_) {}
      throw new Error(`API returned ${response.status}${detail ? ": " + detail : ""}`);
    }
    return response.json();
  }

  async function loadProjects() {
    if (state.loading) return;
    state.loading = true;
    syncTabs();
    grid.innerHTML = "";
    setStatus('<span class="spinner"></span> Loading projects…');
    $("prevBtn").disabled = state.page === 0;
    $("nextBtn").disabled = true;
    const params = new URLSearchParams();
    if (state.query) params.set("query", state.query);
    const facetKey = state.type === "plugin" ? "all_project_types" : "project_type";
    params.set("facets", JSON.stringify([[`${facetKey}:${state.type}`]]));
    params.set("index", state.sort);
    params.set("offset", String(state.page * PAGE_SIZE));
    params.set("limit", String(PAGE_SIZE));
    try {
      const data = await fetchJSON(`${API}/search?${params.toString()}`);
      state.total = data.total_hits || 0;
      $("resultCount").textContent = `${number(state.total)} projects`;
      $("pageLabel").textContent = `Page ${state.page + 1}`;
      $("prevBtn").disabled = state.page === 0;
      $("nextBtn").disabled = (state.page + 1) * PAGE_SIZE >= state.total || data.hits.length < PAGE_SIZE;
      if (!data.hits.length) {
        setStatus("No projects found. Try another search.", "");
      } else {
        setStatus("");
        grid.innerHTML = data.hits.map(projectCard).join("");
        grid.querySelectorAll(".project-card").forEach(card => {
          card.addEventListener("click", () => openProject(card.dataset.id));
        });
      }
    } catch (error) {
      setStatus(`Could not load projects. ${escapeHTML(error.message)}<br><br>Check your internet connection and try again.`, "error");
    } finally {
      state.loading = false;
    }
  }

  function projectCard(p) {
    const icon = p.icon_url
      ? `<img class="project-icon" src="${escapeHTML(p.icon_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="project-icon fallback">${escapeHTML((p.title || "?").slice(0,1).toUpperCase())}</div>`;
    const tags = (p.display_categories || p.categories || []).slice(0,3).map(t => `<span>${escapeHTML(t.replaceAll("_"," "))}</span>`).join("");
    return `<article class="project-card" data-id="${escapeHTML(p.project_id)}" tabindex="0" role="button" aria-label="View ${escapeHTML(p.title)}">
      <div class="card-top">${icon}<div style="min-width:0"><h3>${escapeHTML(p.title)}</h3><div class="author">by ${escapeHTML(p.author || "Unknown")}</div></div></div>
      <p class="description">${escapeHTML(p.description || "No description available.")}</p>
      <div class="card-tags">${tags}</div>
      <div class="card-bottom"><span>⬇ <b class="downloads">${number(p.downloads)}</b> downloads</span><span>♡ ${number(p.follows)}</span></div>
    </article>`;
  }

  async function openProject(id) {
    const dialog = $("projectDialog"), content = $("dialogContent");
    content.innerHTML = '<div class="status"><span class="spinner"></span> Loading project details…</div>';
    dialog.showModal();
    try {
      const [project, versions] = await Promise.all([
        fetchJSON(`${API}/project/${encodeURIComponent(id)}`),
        fetchJSON(`${API}/project/${encodeURIComponent(id)}/version`)
      ]);
      const icon = project.icon_url ? `<img src="${escapeHTML(project.icon_url)}" alt="">` : "";
      const versionRows = versions.slice(0,8).map(v => {
        const file = (v.files || []).find(f => f.primary) || (v.files || [])[0];
        const url = file ? file.url : "";
        return `<div class="version-row"><div><b>${escapeHTML(v.name || v.version_number)}</b><small>${escapeHTML((v.game_versions || []).slice(0,4).join(", "))} · ${escapeHTML((v.loaders || []).join(", "))}</small></div>${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">Download ↗</a>` : "<span>Unavailable</span>"}</div>`;
      }).join("");
      content.innerHTML = `<div class="dialog-head">${icon}<div><h2>${escapeHTML(project.title)}</h2><div class="author">by ${escapeHTML(project.team || "Modrinth creator")}</div></div></div>
        <p class="dialog-description">${escapeHTML(project.description || "")}</p>
        <div class="dialog-actions"><a class="action-link" href="https://modrinth.com/${encodeURIComponent(project.project_type || state.type)}/${encodeURIComponent(project.slug || id)}" target="_blank" rel="noopener">View on Modrinth ↗</a></div>
        <h3 class="versions-title">Latest versions</h3>${versionRows || '<p class="author">No public versions available.</p>'}`;
    } catch (error) {
      content.innerHTML = `<p class="status error">Could not load details: ${escapeHTML(error.message)}</p>`;
    }
  }

  document.querySelectorAll("[data-type]").forEach(button => button.addEventListener("click", () => {
    state.type = button.dataset.type; state.page = 0; loadProjects();
  }));
  $("searchForm").addEventListener("submit", e => {
    e.preventDefault(); state.query = $("searchInput").value.trim(); state.page = 0; loadProjects();
  });
  $("sortSelect").addEventListener("change", e => { state.sort = e.target.value; state.page = 0; loadProjects(); });
  $("prevBtn").addEventListener("click", () => { if (state.page > 0) { state.page--; loadProjects(); window.scrollTo({ top: 400, behavior: "smooth" }); } });
  $("nextBtn").addEventListener("click", () => { if ((state.page + 1) * PAGE_SIZE < state.total) { state.page++; loadProjects(); window.scrollTo({ top: 400, behavior: "smooth" }); } });
  $("closeDialog").addEventListener("click", () => $("projectDialog").close());
  $("projectDialog").addEventListener("click", e => { if (e.target === $("projectDialog")) $("projectDialog").close(); });
  $("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("crafthub-theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  if (localStorage.getItem("crafthub-theme") === "dark") document.body.classList.add("dark");
  loadProjects();
})();