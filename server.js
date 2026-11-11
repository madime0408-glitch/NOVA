const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const maxBodyBytes = 256 * 1024;
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/deployment-config.js": ["deployment-config.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

function loadLocalEnvironment() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        chunks.length = 0;
        reject(Object.assign(new Error("La requête est trop volumineuse."), { status: 413 }));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Le corps de la requête doit être un JSON valide."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    return "La conversation est invalide. Commencez une nouvelle conversation et réessayez.";
  }
  if (messages[0]?.role !== "user" || messages[messages.length - 1]?.role !== "user") {
    return "Le dernier message de la conversation doit être une question.";
  }
  for (const message of messages) {
    if (!message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || !message.content.trim()
      || message.content.length > 12000) {
      return "Un message est invalide ou trop long.";
    }
  }
  return "";
}

async function handleChat(request, response) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(response, 503, { error: "Configurez la variable d’environnement ANTHROPIC_API_KEY puis redémarrez Nova." });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Impossible de lire la requête." });
    return;
  }

  const validationError = validateMessages(body.messages);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const systemPrompt = body.deepResearch
    ? "Tu es Claude, un assistant IA utile et rigoureux. Réponds en français, analyse la demande en profondeur, structure les points importants et distingue les faits des incertitudes. Tu n'as pas accès au Web : ne prétends pas avoir vérifié des informations en ligne et signale clairement les éléments qui nécessitent des sources à jour."
    : "Tu es Claude, un assistant IA utile et clair. Réponds dans la langue de l'utilisateur, de façon exacte et adaptée au contexte. Tu n'as pas accès au Web : ne prétends pas avoir vérifié des informations en ligne.";

  try {
    const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        system: systemPrompt,
        messages: body.messages,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json().catch(() => ({}));
      const providerMessage = errorBody.error?.message;
      const message = apiResponse.status === 401
        ? "La clé API Claude est invalide. Vérifiez la variable d’environnement ANTHROPIC_API_KEY."
        : apiResponse.status === 429
          ? "La limite ou le crédit de l’API Claude est atteint. Vérifiez votre compte Anthropic."
          : `Claude a refusé la requête (${apiResponse.status})${providerMessage ? ` : ${providerMessage}` : "."}`;
      sendJson(response, 502, { error: message });
      return;
    }

    const result = await apiResponse.json();
    const reply = result.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!reply) {
      sendJson(response, 502, { error: "Claude n’a renvoyé aucun texte. Réessayez." });
      return;
    }
    sendJson(response, 200, { reply });
  } catch (error) {
    console.error("Erreur lors de l’appel à l’API Anthropic :", error.message);
    const timedOut = error.name === "TimeoutError";
    sendJson(response, 502, {
      error: timedOut
        ? "La réponse de Claude prend trop de temps. Réessayez."
        : "Connexion à l’API Claude impossible. Vérifiez votre connexion Internet et réessayez.",
    });
  }
}

function handleRequest(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/api/status") {
    sendJson(response, 200, { configured: Boolean(process.env.ANTHROPIC_API_KEY), model });
    return;
  }
  if (request.method === "POST" && pathname === "/api/chat") {
    handleChat(request, response);
    return;
  }
  if (request.method === "GET" && staticFiles[pathname]) {
    const [file, contentType] = staticFiles[pathname];
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    fs.createReadStream(path.join(root, file)).pipe(response);
    return;
  }
  sendJson(response, 404, { error: "Page introuvable." });
}

loadLocalEnvironment();
http.createServer(handleRequest).listen(port, host, () => {
  console.log(`Nova écoute sur ${host}:${port}`);
  console.log(`Connexion Claude : ${process.env.ANTHROPIC_API_KEY ? "clé configurée" : "clé API manquante (.env)"}`);
});
