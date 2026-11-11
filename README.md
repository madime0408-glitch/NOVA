# Nova — recherche Web

Nova affiche des résultats Web Tavily. Aucun assistant IA ne génère les réponses. La clé Tavily reste dans un secret Cloudflare Worker et n’est jamais publiée dans le dépôt.

## Configurer le moteur gratuit

L’offre Tavily gratuite comprend **1 000 crédits par mois**, sans carte bancaire. Une recherche `basic` consomme un crédit. N’ajoutez pas de moyen de paiement ni d’option pay-as-you-go si vous voulez rester à 0 €; quand le quota gratuit est atteint, le fournisseur peut refuser les recherches.

1. Créez un compte Tavily gratuit et copiez sa clé API.
2. Le Worker `nova` utilise `worker/index.mjs` et l’URL `https://nova.madime0408.workers.dev`. Le fichier `wrangler.jsonc` configure son point d’entrée pour que `npx wrangler deploy` publie bien le Worker (et non un site statique).
3. Dans Cloudflare, ouvrez **Workers & Pages > nova > Settings > Variables and Secrets** et ajoutez `TAVILY_API_KEY` comme **secret**. Ne mettez jamais la clé dans GitHub ni dans le code navigateur.
4. Déployez le Worker depuis Cloudflare. Si le projet est lié à GitHub, un push sur `main` le redéploie automatiquement; sinon, lancez `npx wrangler deploy` depuis la racine du dépôt.
5. Dans **Settings > Pages**, vérifiez que la source est **GitHub Actions**, puis relancez le workflow **Deploy static preview to GitHub Pages**. L’adresse publique du Worker est déjà renseignée dans `deployment-config.js`.

Cloudflare Workers offre un quota gratuit; Tavily limite l’usage à son quota mensuel. Les recherches s’arrêtent si Tavily refuse la requête. Le site affiche des liens et extraits provenant des sources, sans générer de synthèse par IA.

## Lancer l’interface localement sur Windows

Installez Node.js 18.18 ou supérieur, puis exécutez `npm start` et ouvrez <http://127.0.0.1:3000>.

Pour vérifier la syntaxe du serveur, de l’interface et du Worker, exécutez `npm run check`. Les tests du proxy de recherche se lancent avec `npm test`.
