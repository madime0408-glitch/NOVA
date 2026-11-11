const STORAGE_KEYS = {
  history: "nova.history.v1",
  saved: "nova.saved.v1",
};

const history = readStoredList(STORAGE_KEYS.history);
const saved = readStoredList(STORAGE_KEYS.saved);
const form = document.querySelector("#search-form");
const promptInput = document.querySelector("#prompt-input");
const homeView = document.querySelector("#home-view");
const resultView = document.querySelector("#result-view");
const collectionView = document.querySelector("#collection-view");
const currentSection = document.querySelector("#current-section");
const toast = document.querySelector("#toast");
let toastTimer;
let currentQuery = "";

function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch (error) {
    console.warn(`Impossible de lire les données locales « ${key} » :`, error);
    return [];
  }
}

function writeStoredList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Impossible d’enregistrer les données locales « ${key} » :`, error);
    showToast("Le stockage local est indisponible sur cet appareil.");
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function showView(view, title, activeNav = view === "result" ? "home" : view) {
  homeView.hidden = view !== "home";
  resultView.hidden = view !== "result";
  collectionView.hidden = view !== "collection";
  currentSection.textContent = title;
  document.querySelectorAll(".primary-nav .nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === activeNav);
  });
  if (window.innerWidth <= 720) document.querySelector("#sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderResult(query, { results = [], loading = false, error = "" } = {}) {
  currentQuery = query;
  const alreadySaved = saved.includes(query);
  const validResults = results.flatMap((result) => {
    try {
      const url = new URL(result.url);
      if (!["http:", "https:"].includes(url.protocol)) return [];
      return [{ ...result, url: url.href, domain: url.hostname }];
    } catch {
      return [];
    }
  });
  const content = loading
    ? '<div class="empty-state" role="status">Recherche sur le Web en cours…</div>'
    : error
      ? `<div class="empty-state error-state" role="alert">${escapeHTML(error)}</div>`
      : validResults.length
        ? `<div class="search-results">${validResults.map((result) => `
          <article class="search-result-card">
            <div class="search-result-domain">${escapeHTML(result.domain)}</div>
            <a class="search-result-link" href="${escapeHTML(result.url)}" target="_blank" rel="noopener noreferrer">
              <h2>${escapeHTML(result.title || result.url)}</h2>
            </a>
            <p>${escapeHTML(result.content || "Ouvrir cette source pour consulter les détails.")}</p>
            <a class="search-result-url" href="${escapeHTML(result.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(result.url)}</a>
          </article>`).join("")}</div>`
        : '<div class="empty-state">Aucun résultat trouvé. Essayez avec d’autres mots-clés.</div>';

  resultView.innerHTML = `
    <div class="result-header">
      <div>
        <div class="result-overline">RECHERCHE WEB</div>
        <h1 class="result-title">${escapeHTML(query)}</h1>
      </div>
      <div class="result-actions">
        <button type="button" class="result-action" data-action="copy">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1.5" /><path d="M12 7V5.5A1.5 1.5 0 0 0 10.5 4h-5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7" /></svg>Copier la recherche
        </button>
        <button type="button" class="result-action ${alreadySaved ? "is-saved" : ""}" data-action="save">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h9v12l-4.5-3-4.5 3V4Z" /></svg>${alreadySaved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
    <div class="search-result-count">${loading ? "Recherche en cours" : error ? "Service indisponible" : `${validResults.length} résultat${validResults.length === 1 ? "" : "s"}`}</div>
    ${content}
    <p class="search-disclaimer">Vérifiez les informations directement auprès des sites sources.</p>`;
  showView("result", "Résultats");
}

async function submitQuery(value) {
  const query = value.trim();
  if (!query) {
    showToast("Saisissez quelques mots pour lancer une recherche.");
    promptInput.focus();
    return;
  }
  if (query.length > 300) {
    showToast("La recherche ne peut pas dépasser 300 caractères.");
    return;
  }
  const searchApiUrl = window.NOVA_SEARCH_API_URL?.trim();
  if (!searchApiUrl) {
    renderResult(query, { error: "Le moteur de recherche n’est pas encore configuré. Réessayez après le déploiement du service de recherche." });
    return;
  }

  history.unshift(query);
  const uniqueHistory = [...new Set(history)].slice(0, 30);
  history.splice(0, history.length, ...uniqueHistory);
  writeStoredList(STORAGE_KEYS.history, history);
  renderResult(query, { loading: true });
  try {
    const response = await fetch(new URL("/search", searchApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Le moteur de recherche n’a pas pu traiter cette demande.");
    if (!Array.isArray(payload.results)) throw new Error("La réponse du moteur de recherche est invalide.");
    renderResult(query, { results: payload.results });
  } catch (error) {
    console.error("La recherche Web a échoué :", error);
    const message = error instanceof TypeError
      ? "Impossible de joindre le moteur de recherche. Vérifiez sa configuration et réessayez."
      : error.message;
    renderResult(query, { error: message });
    showToast(message);
  }
}

function openHistory() {
  collectionView.innerHTML = `
    <div class="collection-overline">VOTRE ACTIVITÉ</div>
    <h1 class="collection-heading">Historique</h1>
    <p class="collection-description">Retrouvez les recherches récentes sur cet appareil.</p>
    ${history.length
      ? `<div class="history-list">${history.map((query) => `
        <button type="button" class="history-row" data-query="${escapeHTML(query)}">
          <span>${escapeHTML(query)}</span><small>Ouvrir →</small>
        </button>`).join("")}</div>`
      : '<div class="empty-state">Vos recherches apparaîtront ici lorsque vous en aurez lancé une.</div>'}`;
  showView("collection", "Historique", "history");
}

function openLibrary() {
  collectionView.innerHTML = `
    <div class="collection-overline">VOTRE ESPACE PERSONNEL</div>
    <h1 class="collection-heading">Bibliothèque</h1>
    <p class="collection-description">Vos recherches enregistrées, conservées sur cet appareil.</p>
    ${saved.length
      ? `<div class="history-list">${saved.map((query) => `
        <button type="button" class="history-row" data-query="${escapeHTML(query)}">
          <span>${escapeHTML(query)}</span><small>Ouvrir →</small>
        </button>`).join("")}</div>`
      : '<div class="empty-state">Enregistrez une recherche pour la retrouver ici.</div>'}`;
  showView("collection", "Bibliothèque", "library");
}

function resetHome() {
  promptInput.value = "";
  promptInput.placeholder = "Que souhaitez-vous rechercher sur le Web ?";
  showView("home", "Accueil");
  promptInput.focus();
}

async function checkSearchStatus() {
  const status = document.querySelector("#search-status");
  const searchApiUrl = window.NOVA_SEARCH_API_URL?.trim();
  if (!searchApiUrl) {
    status.classList.add("is-unavailable");
    status.textContent = "Recherche à configurer";
    return;
  }
  try {
    const response = await fetch(new URL("/health", searchApiUrl));
    const payload = await response.json();
    const configured = response.ok && payload.configured === true;
    status.classList.toggle("is-ready", configured);
    status.classList.toggle("is-unavailable", !configured);
    status.innerHTML = `<span class="provider-dot"></span>${configured ? "Recherche Web gratuite" : "Moteur indisponible"}`;
  } catch (error) {
    console.warn("Impossible de vérifier le moteur de recherche :", error);
    status.classList.add("is-unavailable");
    status.innerHTML = '<span class="provider-dot"></span>Moteur indisponible';
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuery(promptInput.value);
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('a[data-nav]')) event.preventDefault();
  const action = target.closest("[data-action]")?.dataset.action;
  const nav = target.closest("[data-nav]")?.dataset.nav;
  const suggestion = target.closest("[data-prompt]")?.dataset.prompt;
  const historyQuery = target.closest("[data-query]")?.dataset.query;

  if (suggestion) {
    submitQuery(suggestion);
    return;
  }
  if (historyQuery) {
    submitQuery(historyQuery);
    return;
  }
  if (nav) {
    if (nav === "home") resetHome();
    else if (nav === "history") openHistory();
    else if (nav === "library") openLibrary();
    return;
  }
  if (!action) return;

  if (action === "new-search") resetHome();
  if (action === "mobile-menu") document.querySelector("#sidebar").classList.toggle("is-open");
  if (action === "help") showToast("Nova affiche les résultats Web fournis par Tavily. Le quota gratuit est limité à 1 000 recherches simples par mois.");
  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(currentQuery);
      showToast("Recherche copiée dans le presse-papiers.");
    } catch (error) {
      console.warn("Impossible d’accéder au presse-papiers :", error);
      showToast("Copie indisponible. Sélectionnez le texte pour le copier.");
    }
  }
  if (action === "save") {
    const index = saved.indexOf(currentQuery);
    if (index >= 0) {
      saved.splice(index, 1);
      showToast("Recherche retirée de la bibliothèque.");
    } else {
      saved.unshift(currentQuery);
      showToast("Recherche enregistrée dans la bibliothèque.");
    }
    writeStoredList(STORAGE_KEYS.saved, saved);
    const button = resultView.querySelector('[data-action="save"]');
    if (button) {
      const isSaved = saved.includes(currentQuery);
      button.classList.toggle("is-saved", isSaved);
      button.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h9v12l-4.5-3-4.5 3V4Z" /></svg>${isSaved ? "Enregistré" : "Enregistrer"}`;
    }
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    resetHome();
  }
  if (event.key === "Escape") document.querySelector("#sidebar").classList.remove("is-open");
});

checkSearchStatus();
