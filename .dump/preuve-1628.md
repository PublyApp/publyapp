# Preuve — PR #1628 / fiche #1624 : `og:url` ne vaut plus le canonique

## Résumé

La montée de srvx 0.11.16 → 0.12.7 a introduit un changement de comportement : les
headers `x-forwarded-proto` et `x-forwarded-host` ne sont plus honorés par défaut.
Le serveur doit désormais opt-in via `trustProxy: true`. Sans cette option, la
dérivation SSR de l'URL (utilisée par `injectSeoMarkup` dans `apps/front/src/server.ts`)
construit `canonical` et `og:url` depuis l'adresse locale du socket
(`http://[::]:3000/`) au lieu de l'URL publique (`https://front.localhost:8443/`).

## Les deux valeurs observées (côte à côte)

### Sans `trustProxy` (bug — ce que produisait srvx 0.12.7 avant le fix)

```
origin: http://[::]:39849
requestPath: /
canonical (link): http://[::]:39849/
og:url (meta): http://[::]:39849/
```

### Avec `trustProxy: true` (fix — ce que produit srvx 0.12.7 après le fix)

```
origin: https://front.localhost:8443
requestPath: /
canonical (link): https://front.localhost:8443/
og:url (meta): https://front.localhost:8443/
```

### Ce que le test e2e attend

```
canonical (link): https://front.localhost:8443/
og:url (meta): https://front.localhost:8443/
```

## Cause exacte

**Symbole** : `NodeRequestURL` dans `srvx/dist/adapters/node.mjs` (0.12.7)

srvx 0.12.7 a introduit un système de `trustProxy` (fichier `_trust-proxy.mjs`).
La classe `NodeRequestURL` utilise désormais `forwardedHopValue()` avec un paramètre
`hops` qui dépend de `trustProxy` :

```js
// srvx 0.12.7 — NodeRequestURL constructor
const forwardedProto = forwardedHopValue(req.headers["x-forwarded-proto"], hops);
const protocol = req.socket?.encrypted || forwardedProto === "https" || trusted && req.headers[":scheme"] === "https" ? "https:" : "http:";
```

Quand `trustProxy` n'est pas défini, `hops = 0` et `forwardedHopValue` retourne
`undefined` — le header `x-forwarded-proto` est ignoré. Le protocole tombe sur
`http:` (sauf si le socket est chiffré) et l'hôte est dérivé de l'adresse locale
du socket.

**En bref** : srvx 0.12.7 a changé la sémantique de `request.url` par défaut.
L'URL dérivée ne reflète plus l'URL publique sauf si `trustProxy: true` est passé
à `serve()`.

## Le correctif

**Fichier** : `apps/front/server.mjs`

```diff
 const server = serve({
 	port,
 	hostname: process.env.HOST ?? '0.0.0.0',
+	trustProxy: true,
 	middleware: [staticFileHandler],
 	fetch: (request) => handler.fetch(request),
 });
```

## Preuve rouge → vert

### Étape 1 : ROUGE (srvx 0.12.7 SANS trustProxy)

Reconstruit l'image front avec le code actuel (srvx 0.12.7, pas de `trustProxy`),
redémarré le container, lancé les tests SEO :

```
Running 4 tests using 1 worker

  ✘  [chromium] › e2e/seo.spec.ts:145:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /
  ✘  [chromium] › e2e/seo.spec.ts:151:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /login
  ✓  [chromium] › e2e/seo.spec.ts:157:2 › SEO metadata › does not emit indexable SEO metadata on unknown routes

  2 failed
    [chromium] › e2e/seo.spec.ts:145:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /
    [chromium] › e2e/seo.spec.ts:151:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /login
  2 passed
```

Assertion en cause (ligne 115 du spec) :

```
expect(hasMetaTag(html, { property: 'og:url', content: canonical })).toBe(true)
// Expected: true — Received: false
```

### Étape 2 : VERT (srvx 0.12.7 AVEC trustProxy)

Reconstruit l'image front avec le fix (`trustProxy: true`), redémarré le container,
relancé les tests SEO :

```
Running 4 tests using 1 worker

  ✓  [chromium] › e2e/seo.spec.ts:145:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /
  ✓  [chromium] › e2e/seo.spec.ts:151:2 › SEO metadata › renders canonical/OG/robots/sitemap/locale tags on /login
  ✓  [chromium] › e2e/seo.spec.ts:157:2 › SEO metadata › does not emit indexable SEO metadata on unknown routes

  4 passed
```

## Notes

- La pile e2e utilisée (`publyapp-front2-real-test`) a été lancée par une autre voie
  — je ne l'ai pas démontée (règle : ne pas démonter une pile qu'on n'a pas montée
  sans vérifier qu'aucune voie ne s'en sert).
- L'image front a été reconstruite deux fois (une sans le fix, une avec) pour
  produire la preuve rouge→vert. Le container actuel contient le fix.
- Le typecheck front passe après le fix.
