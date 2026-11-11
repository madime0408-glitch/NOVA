# Nova — connexion à Claude

Nova utilise l’API officielle Anthropic. La clé reste côté serveur et n’est jamais envoyée au navigateur.

## Publier l’aperçu sur GitHub Pages

1. Créez un dépôt GitHub et envoyez-y les fichiers du projet.
2. Dans les paramètres du dépôt, ouvrez **Pages** et choisissez **GitHub Actions** comme source.
3. Envoyez une modification sur la branche `main` ou `master`, ou lancez manuellement l’action **Deploy static preview to GitHub Pages** depuis l’onglet **Actions**.
4. Récupérez l’adresse publiée dans **Settings > Pages** ou dans le résultat de l’action.

GitHub Pages héberge uniquement l’interface statique : les réponses Claude, qui nécessitent le serveur Node, ne sont pas disponibles dans cette version. La clé Anthropic ne doit jamais être ajoutée au dépôt. Pour activer le chat Claude, il faudra également héberger `server.js` sur une plateforme serveur et y configurer `ANTHROPIC_API_KEY` comme secret.

## Démarrer localement sur Windows

1. Installez Node.js 18.18 ou supérieur.
2. Créez une clé API depuis la console Anthropic.
3. Copiez `.env.example` vers `.env`, puis renseignez `ANTHROPIC_API_KEY` dans `.env`.
4. Dans un terminal PowerShell, depuis ce dossier, lancez `npm start`.
5. Ouvrez <http://127.0.0.1:3000>.

Le compte Anthropic doit disposer d’un accès API et de crédits. L’option « Recherche approfondie » demande à Claude une réponse plus structurée ; elle n’active pas de recherche Web.

Pour changer de modèle, modifiez `ANTHROPIC_MODEL` dans `.env` avec un identifiant de modèle pris en charge par Anthropic, puis redémarrez le serveur.
