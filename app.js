const STORAGE_KEYS = {
  history: "nova.history.v1",
  saved: "nova.saved.v1",
};

const toolCatalog = [
  { title: "Rapport", description: "Des recherches détaillées sur vos sujets", icon: "document", color: "lavender" },
  { title: "Présentation", description: "Transformez vos idées en diapositives", icon: "presentation", color: "peach" },
  { title: "Image", description: "Donnez vie à votre imagination", icon: "image", color: "rose" },
  { title: "Tableur", description: "Organisez données et projets", icon: "table", color: "mint" },
  { title: "Assistant d’écriture", description: "Rédigez, reformulez et trouvez le bon ton", icon: "write", color: "blue" },
  { title: "Planificateur", description: "Structurez vos idées et vos prochaines étapes", icon: "plan", color: "peach" },
];

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
let currentAnswer = "";
let chatMessages = [];

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
  return value.replace(/[&<>"']/g, (character) => ({
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

function renderResult(query, answer, deepResearch = false, errorMessage = "") {
  currentQuery = query;
  currentAnswer = answer;
  const alreadySaved = saved.includes(query);
  const followUps = [
    "Quels sont les points essentiels à retenir ?",
    "Peux-tu proposer un plan d’action ?",
    "Quelles questions devrais-je explorer ensuite ?",
  ];

  resultView.innerHTML = `
    <div class="result-header">
      <div>
        <div class="result-overline">${deepResearch ? "RECHERCHE APPROFONDIE" : "NOUVELLE RECHERCHE"}</div>
        <h1 class="result-title">${escapeHTML(query)}</h1>
      </div>
      <div class="result-actions">
        <button type="button" class="result-action" data-action="copy">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1.5" /><path d="M12 7V5.5A1.5 1.5 0 0 0 10.5 4h-5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7" /></svg>Copier
        </button>
        <button type="button" class="result-action ${alreadySaved ? "is-saved" : ""}" data-action="save">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h9v12l-4.5-3-4.5 3V4Z" /></svg>${alreadySaved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
    <div class="demo-notice ${errorMessage ? "error-notice" : ""}">
      <span class="demo-notice-icon" aria-hidden="true">${errorMessage ? "!" : "ⓘ"}</span>
      <div>${errorMessage
        ? `<strong>La réponse n’a pas pu être générée.</strong> ${escapeHTML(errorMessage)}`
        : answer
          ? "<strong>Réponse générée par Claude.</strong> Claude n’a pas accès au Web dans cette intégration ; vérifiez les informations qui nécessitent des sources à jour."
          : "<strong>Connexion à Claude…</strong> Votre réponse est en cours de génération."}</div>
    </div>
    <article class="answer-card">
      <div class="answer-text">${answer ? escapeHTML(answer) : (errorMessage ? "Vérifiez la configuration Claude puis réessayez." : "Claude prépare une réponse…")}</div>
    </article>
    <section class="follow-up">
      <h2>Pour aller plus loin</h2>
      <div class="follow-up-chips">
        ${followUps.map((text) => `<button type="button" class="follow-up-chip" data-prompt="${escapeHTML(text)}">${escapeHTML(text)}</button>`).join("")}
      </div>
    </section>
    <form class="result-composer" id="follow-up-form">
      <label class="sr-only" for="follow-up-input">Poser une question complémentaire</label>
      <input id="follow-up-input" placeholder="Posez une question complémentaire…" maxlength="1200" />
      <button type="submit" aria-label="Envoyer"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10 5l5 5-5 5" /></svg></button>
    </form>`;
  showView("result", "Résultat");
}

async function submitQuery(value, deepResearch = false) {
  const query = value.trim();
  if (!query) {
    showToast("Écrivez une question ou une idée pour commencer.");
    promptInput.focus();
    return;
  }
  if (window.NOVA_STATIC_HOSTING) {
    showToast("Cette version GitHub Pages affiche l’interface uniquement ; les réponses Claude nécessitent un serveur.");
    return;
  }
  history.unshift(query);
  const uniqueHistory = [...new Set(history)].slice(0, 30);
  history.splice(0, history.length, ...uniqueHistory);
  writeStoredList(STORAGE_KEYS.history, history);
  const pendingMessages = [...chatMessages, { role: "user", content: query }];
  renderResult(query, "", deepResearch);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...chatMessages.slice(-18), { role: "user", content: query }], deepResearch }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Une erreur est survenue pendant la connexion à Claude.");
    chatMessages = [...pendingMessages, { role: "assistant", content: payload.reply }];
    renderResult(query, payload.reply, deepResearch);
  } catch (error) {
    console.error("La requête Claude a échoué :", error);
    const message = error instanceof TypeError
      ? "Impossible de joindre le serveur Nova. Lancez l’application avec « npm start »."
      : error.message;
    renderResult(query, "", deepResearch, message);
    showToast(message);
  }
}

function renderToolCard(tool) {
  const iconMap = {
    document: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h8l4 4v11H6v-15Z"/><path d="M14 4.5v4h4M9 12h6M9 15h6"/></svg>',
    presentation: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M12 16v4m-3 0h6M8 13l3-3 2 2 3-4"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m5 17 4.5-4 3 2.5 3.5-4 3 2.5"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M4.5 10h15M10 4.5v15M15 10v9.5"/></svg>',
    write: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 18 1.1-3.8 9.2-9.2a2 2 0 0 1 2.8 2.8L8.9 16.9 5 18Z"/><path d="m13.5 6.7 3.8 3.8"/></svg>',
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
  };
  return `<span class="card-icon card-icon-${tool.color}">${iconMap[tool.icon]}</span>
    <span><strong>${escapeHTML(tool.title)}</strong><small>${escapeHTML(tool.description)}</small></span>`;
}

function openTools() {
  collectionView.innerHTML = `
    <div class="collection-overline">VOTRE ESPACE CRÉATIF</div>
    <h1 class="collection-heading">Tous les outils</h1>
    <p class="collection-description">Choisissez un point de départ pour votre prochain projet.</p>
    <div class="collection-grid">${toolCatalog.map((tool) => `
      <button type="button" class="collection-item" data-tool="${escapeHTML(tool.title)}">
        ${renderToolCard(tool)}
      </button>`).join("")}
    </div>`;
  showView("collection", "Tous les outils", "tools");
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

function openTool(toolName) {
  const tool = toolCatalog.find((item) => item.title === toolName);
  const description = tool?.description || "Choisissez un sujet pour commencer votre projet.";
  chatMessages = [];
  showView("home", "Accueil");
  promptInput.value = "";
  promptInput.placeholder = `Décrivez votre projet pour ${toolName.toLowerCase()}…`;
  promptInput.focus();
  showToast(`${toolName} — ${description}. Saisissez votre idée pour commencer.`);
}

function resetHome() {
  promptInput.value = "";
  chatMessages = [];
  promptInput.placeholder = "Que souhaitez-vous savoir, créer ou explorer ?";
  document.querySelector("#deep-research").checked = false;
  showView("home", "Accueil");
  promptInput.focus();
}

async function checkProviderStatus() {
  const status = document.querySelector("#provider-status");
  if (window.NOVA_STATIC_HOSTING) {
    status.classList.add("is-unavailable");
    status.textContent = "Aperçu statique · sans Claude";
    document.querySelector(".credits-badge").hidden = true;
    return;
  }
  try {
    const response = await fetch("/api/status");
    const { configured } = await response.json();
    status.classList.toggle("is-ready", configured);
    status.classList.toggle("is-unavailable", !configured);
    status.innerHTML = `<span class="provider-dot"></span>${configured ? "Claude configuré" : "Clé API manquante"}`;
  } catch (error) {
    console.warn("Impossible de vérifier la connexion Claude :", error);
    status.classList.add("is-unavailable");
    status.innerHTML = '<span class="provider-dot"></span>Serveur indisponible';
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuery(promptInput.value, document.querySelector("#deep-research").checked);
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('a[data-nav]')) event.preventDefault();
  const action = target.closest("[data-action]")?.dataset.action;
  const nav = target.closest("[data-nav]")?.dataset.nav;
  const tool = target.closest("[data-tool]")?.dataset.tool;
  const suggestion = target.closest("[data-prompt]")?.dataset.prompt;
  const historyQuery = target.closest("[data-query]")?.dataset.query;

  if (suggestion) {
    chatMessages = [];
    submitQuery(suggestion);
    return;
  }
  if (historyQuery) {
    chatMessages = [];
    submitQuery(historyQuery);
    return;
  }
  if (tool) {
    openTool(tool);
    return;
  }
  if (nav) {
    if (nav === "home") resetHome();
    else if (nav === "history") openHistory();
    else if (nav === "library") openLibrary();
    else if (nav === "tools") openTools();
    return;
  }
  if (!action) return;

  if (action === "new-chat") resetHome();
  if (action === "mobile-menu") document.querySelector("#sidebar").classList.toggle("is-open");
  if (action === "attach") showToast("La pièce jointe sera disponible avec l’intégration du service.");
  if (action === "upgrade") showToast("Les offres Nova seront bientôt disponibles.");
  if (action === "profile") showToast("Profil de démonstration — connexion non configurée.");
  if (action === "help") showToast("Bienvenue sur Nova : décrivez une question ou choisissez un outil.");
  if (action === "discover") openTools();
  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(currentAnswer || currentQuery);
      showToast(currentAnswer ? "Réponse copiée dans le presse-papiers." : "Question copiée dans le presse-papiers.");
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

document.addEventListener("submit", (event) => {
  if (event.target.id !== "follow-up-form") return;
  event.preventDefault();
  const input = event.target.querySelector("input");
  submitQuery(input.value);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    resetHome();
  }
  if (event.key === "Escape") document.querySelector("#sidebar").classList.remove("is-open");
});

checkProviderStatus();
