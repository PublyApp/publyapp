# Plan d'implémentation — #487 : préchargement des requêtes de route (`staticData.preload`)

**Type** : record `plan` (écrit une fois, périmé plutôt que rétroédité). **Issue** : #487.
**Précédent technique** : PR ouverte #1527 (loader client du détail profil) — sa règle
« aucun second chemin de fetch par construction » est la contrainte n°3 de ce plan. L'arbitrage
du propriétaire du 2026-08-26 (commentaire d'issue) fait autorité et est appliqué tel quel :
`staticData.preload` par route, échec de préchargement silencieux, garde obligatoire sur le vrai
artefact, articulation explicite avec `staleTime` et les loaders client, mesure chiffrée.

## 0. État des lieux, vérifié sur `origin/develop` = `198a6e4b7`

Chaque affirmation est prouvée dans `.dump/citations-r1.md` (PASS/FAIL par ligne, sorties collées).

1. `apps/front/src/router.tsx:176` : `defaultPreload: 'intent'`. Le routeur précharge donc déjà
   le **composant** de route au survol d'un `<Link>` ; ses données partent au montage. Le gain
   JS est consommé, le gain réseau ne l'est pas.
2. Zéro `ensureQueryData` / `prefetchQuery` / `clientLoader` dans `apps/front/src/`
   (comptages `git grep` = 0). La PR #1527 est **ouverte, non fusionnée** : son loader client
   n'est pas dans cet arbre. Ce plan s'articule avec elle (§5), il ne la suppose pas fusionnée.
3. Les 3 fichiers de route qui déclarent un `loader:` (`verify-email.tsx`, `accept-invitation.tsx`,
   `reset-password.tsx`) sont des surfaces SSR dont les loaders appellent des `createServerFn`
   (`~/lib/server/*`) : hors périmètre TanStack Query, intouchés par ce plan.
4. Le mécanisme co-localisé existe : chaque route étend `StaticDataRouteOption`
   (`breadcrumbs.ts:75`, `i18n.namespaces.ts:35`) et déclare `staticData.crumbs` à côté de son
   composant (`$profileId.tsx:219-226`). `staticData.preload` suit exactement la même forme.
5. Les données passent par des factories partagées `{ queryKey(vars), fetcher(vars) }`
   (`buildStaffQueryOptions`, `create-hooks.ts:415`) que les pages consomment via leurs hooks
   (`useStaffProfilesQuery` dans `staff-profiles.ts:525`, `useStaffTenantDetailsQuery` dans
   `staff-tenants.ts:559`) et que les crumbs réutilisent déjà (`staffTenantCrumbQuery`,
   `staffTenantProfileCrumbQuery`). Un préchargement qui pointe vers ces mêmes factories est
   dedupliqué par TanStack Query par clé : il ne peut pas devenir un second chemin de fetch.

## 0b. Écart assumé vis-à-vis de #487 (déviation silencieuse corrigée)

Sur les 12 critères d'acceptation de l'issue #487, quatre sont **modifiés ou abandonnés**
dans ce plan. Ils ne l'étaient pas dans la r1 ; la relecture r2 (verdict `CHANGES_REQUIRED`)
a tranché : une déviation de périmètre non nommée est un défaut. Chacun est ici assumé,
justifié, et suivi par une issue de suivi `follow-up lv1` citée. Le corps de PR reprend ce
résumé (voir `.dump/pr-body.md`). Le plan reste fidèle à l'arbitrage propriétaire du
2026-08-26, qui prime sur la forme initiale de l'issue.

| # | Critère #487 abandonné/modifié | Forme retenue ici | Pourquoi (tranché) | Suivi |
|---|---|---|---|---|
| 1 | Helper impératif `routeQueries(...)` + `criticalRouteQuery`/`secondaryRouteQuery`/`interactionRouteQuery`/`blockingRouteQuery` (Slice 1) | Déclaratif `staticData.preload` co-localisé avec `staticData.crumbs` (§1) | L'arbitrage impose `staticData.preload` par route comme surface unique ; un helper impératif est une seconde API et un second registre. La forme déclarative réutilise le mécanisme `crumbs` et les factories partagées (règle « pas de second chemin de fetch » de #1527). | #1588 |
| 2 | Règle Oxlint `publy/route-query-preload` testée, commentaires d'échappement, démarrée en warning (Slice 5) | **Absente** du plan ; remplacée par la garde contractuelle vitest §4 sur le VRAI artefact | La garde §4 confronte les clés préchargées aux clés réellement consommées par la page (impossible à faire par une règle de forme sur le source seul). La règle Oxlint reste utile comme garde *bon marché* préalable ; elle est suivie séparément. | #1589 |
| 3 | Pilote sur la mise en page authentifiée `authed/_layout/authed-layout.tsx` (Slice 3) | Pilotes `authed/staff/tenants/$tenantId.tsx` (T2) + `authed/staff/profiles.tsx` (T4) | Le hook unique `usePreloadIntentQueries()` (§1.1) couvre DÉJÀ l'intent-preload du layout auth globalement ; un pilote de layout dupliquerait le mécanisme. Les deux pilotes retenus exercent les cas durs (paramètre dérivé `$tenantId`, variables URL par défaut) et deviennent les premières routes couvertes par la garde (§10). | #1590 |
| 4 | Doc dédiée `docs/guides/frontend-route-query-preloading.md` (Slice 2) | Repliée dans la sous-section « Route query preloading (#487) » de `docs/guides/front/conventions.md` (T5) | `conventions.md` est la source de vérité enforceée des standards front (gardes design-system/lint) ; y tenir le contrat évite un doc qui dérive. Un guide narratif compagnon pourra être ajouté ultérieurement. | #1591 |

Aucun des quatre n'est une régression de l'arbitrage propriétaire : tous les points
obligatoires (preload par route, échec silencieux, garde sur artefact réel, articulation
`staleTime`/loaders, mesure chiffrée) sont intégralement livrés. Les criteres 1, 2, 3, 4 de
l'issue sont soit reformulés (1, 3, 4), soit déplacés en suivi (2) ; le reste des 12 criteres
est inchangé.

## 1. Forme retenue : `staticData.preload` déclaré par route

```ts
export const Route = createFileRoute(...)({
	staticData: {
		crumbs: staffTenantProfileCrumbsBase,            // déjà là (#973/#1033)
		preload: ({ params }) => [                       // nouveau, même mécanisme
			{ options: staffTenantDetailsQueryOptions, variables: { tenantId: params.tenantId } },
			{ options: staffTenantProfileDetailsQueryOptions, variables: { tenantId: params.tenantId, profileId: params.profileId } },
		],
	},
});
```

Pas de registre central. Une route sans préchargement n'ajoute pas la clé. La valeur est un tableau
d'entrées `{ options, variables }` où `options` est une factory exportée de `lib/query/*` — jamais
un littéral `{ queryKey, queryFn }` écrit en ligne dans la route : écrire un littéral serait créer
le second chemin de fetch que le garde traque (§4).

### 1.1 Qui exécute le preload (tranché explicitement)

Le champ `staticData` est une extension maison (`declare module '@tanstack/react-router'
{ interface StaticDataRouteOption { … } }`), pas une option du routeur : quelque chose doit lire ce
champ au moment du preload d'intention. Deux candidats ont été tranchés :

* **Retenu — hook de branchement unique** : `usePreloadIntentQueries()` dans
  `apps/front/src/lib/query/preload-intent.ts`. Monté UNE fois dans le shell authentifié
  CSR (`apps/front/src/components/app-shell/app-shell.tsx`, l'emplacement qui héberge déjà les effets
  globaux du shell). **Montage CSR uniquement** : le shell authentifié est `ssr: false`
  (`docs/guides/front/conventions.md`, l.281 — « Authenticated application surfaces are CSR with
  `ssr: false` ») ; le hook doit de plus être protégé par un garde `isServer` explicite
  (`if (isServer) return;`) pour qu'un montage accidentel dans un shell universel ne branche
  jamais d'effet côté serveur. Il s'abonne au routeur via `router.subscribe('onBeforeLoad', …)`
  et, pour chaque entrée `staticData.preload` de la destination, résout d'abord les matches lui-même
  : l'événement `NavigationEventInfo` **ne porte pas** de `matches` (forme vérifiée dans le
  lockfile, `@tanstack/router-core@1.171.26/dist/esm/router.d.ts` l.419-426 :
  `{ fromLocation?, toLocation, pathChanged, hrefChanged, hashChanged }`). Le hook appelle donc
  `router.matchRoute(event.toLocation)` puis parcourt les matches résolus pour lire chaque
  `staticData.preload`. Fondement vérifié dans le même fichier : `RouterEvents` expose `onBeforeLoad`
  (l.430) et `SubscribeFn` retourne une fonction de désabonnement (l.452), et `Router` expose
  `matchRoute: MatchRouteFn` (l.750).
  Pourquoi ici et pas ailleurs : c'est le seul point où l'on capte TOUT preload d'intention
  (survol ET viewport ET navigation) sans modifier chaque route ni dépendre d'une option
  inexistante dans cette version du routeur.
* **Rejeté — loader partagé ajouté à chaque route** : un `loader` par route qui ferait le même
  travail. Rejeté car il duplique le mécanisme 60 fois, se confond avec le futur loader client
  sanctionné de #1527 (qui, lui, DOIT bloquer), et transforme une déclaration déclarative en
  plomberie répétée.
* **Rejeté — `beforeLoad({ cause })`** : tourne aussi pour `cause: 'preload'`, mais ajoute une
  phase asynchrone au cycle de vie de chaque route pour un besoin global, et mélange « déclarer »
  et « exécuter » alors que la décision du propriétaire veut la déclaration seule dans la route.

Le hook ignore silencieusement toute erreur (§2). Il ne fait rien quand `event` provient d'un
preload déjà satisfait : `ensureQueryData` est idempotent par clé fraîche (staleTime, §6).

### 1.2 Types

Extension dans un nouveau module typé (même pattern que `breadcrumbs.ts`) :

```ts
// apps/front/src/lib/navigation/route-preload.ts
import type { QueryKey } from '@tanstack/react-query';

// Shared-factory shape produced by `buildStaffQueryOptions` (packages/shared-ts
// create-hooks.ts:415): `{ queryKey(vars), fetcher(vars) }`. The entry couples a
// `options` factory (defaulted to `any` variables so ANY concrete factory fits)
// with the `variables` it is called with. This is the SAME shape the page body
// and the crumbs already consume — so a `preload` entry cannot introduce a
// second fetch path (§4, first guard tier).
export type RoutePreloadFactory<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<unknown>;
};

export type RoutePreloadEntry = {
	options: RoutePreloadFactory<any>;
	variables: Record<string, unknown>;
};

// The generic lives on the FUNCTION: `preload` is `(args) => readonly
// RoutePreloadEntry[]`, NOT `RoutePreloadEntry<never>[]`. Freezing the entry to
// `never` (r1 draft) made `variables: never` and every `variables: { tenantId }`
// literal a type error — the §1 / T2 example would not compile. Here the
// function returns a plain `readonly RoutePreloadEntry[]`; each literal entry's
// `options` is checked against the factory *shape* and its `variables` flows
// through. Verified to compile against the real `staffTenantDetailsQueryOptions`
// / `staffTenantProfileDetailsQueryOptions` factories (proof in `.dump/citations-r2.md`, B1).
export type RoutePreload = (args: {
	params: Record<string, string>;
}) => readonly RoutePreloadEntry[];

// declaration merging :
declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		preload?: RoutePreload;
	}
}
```

La contrainte de forme (`options.queryKey` + `options.fetcher`, tous deux
`(variables) => …`) rend IMPOSSIBLE de compiler une entrée qui ne vient pas d'une
factory partagée : TypeScript rejette un littéral ad hoc qui ne porte pas
exactement ces membres signés par la factory. C'est le premier étage de la garde
(§4). Le couplage exact `variables ↔ factory` (type de `tenantId` dérivé de la
factory précise) n'est PAS porté statiquement ici — il est vérifié dynamiquement
par la garde T3 (§4) qui lit la clé concrète `options.queryKey(variables)` et la
confronte aux clés consommées par la page.

## 2. Échec de préchargement : silencieux, rien à l'écran (arbitrage appliqué)

* `ensureQueryData` est invoqué sous `.catch(() => undefined)` côté hook : aucun toast, aucun
  état d'erreur, aucune entrée de log en niveau error. Raison : un préchargement est spéculatif ;
  l'utilisateur n'a peut-être jamais cliqué. La vraie requête partira au montage et c'est ELLE
  qui dira sa cause via `QueryDisplay` si elle échoue à son tour. La règle « toute panne dit sa
  cause » vaut pour la requête que l'utilisateur attend, pas pour une tentative qu'il ignore.
* Conséquence non négociable : un échec de préchargement NE marque PAS l'entrée comme chargée.
  TanStack Query gère cela seul (une promesse rejetée n'alimente pas le cache en data) ; le plan
  interdit explicitement tout code qui transformerait l'échec en donnée (pas de `data: null`
  synthétique, pas de flag « already attempted »).
* Le backstop 401→logout central (`handleAuthedQueryError`, `router.tsx:104`) ne doit PAS se
  déclencher depuis un préchargement avorté : le plan vérifie ce comportement dans la tâche T3
  (cas de test dédié : préchargement 401 sur une session expirée pendant le survol ne logout PAS,
  puisque la requête au montage fera son travail).

## 3. Articulation tranchée avec les loaders client (§Rendering Strategy)

État : les conventions (`docs/guides/front/conventions.md`, §Rendering Strategy, ligne 277)
n'autorisent pas encore de loader client ; la PR #1527 propose la première exception (détail
profil, `await ensureQueryData` AVANT premier rendu, pairée à un `pendingComponent`).

Tranché dans ce plan, les deux mécanismes sont complémentaires et leur frontière est :

* **`staticData.preload` = spéculatif, non bloquant, toujours silencieux.** Déclenché par une
  intention (survol). Ne participe jamais au rendu de la page courante.
* **loader client (#1527) = obligatoire, bloquant, pairé à `pendingComponent`.** Résout une
  exigence de rendu (« ces données doivent être en cache avant la première image », ex. noms de
  crumbs). Une route peut avoir LES DEUX : le `staticData.preload` réchauffe tôt au survol ; si
  l'utilisateur clique malgré un échec de préchargement, le loader client repart et bloque
  proprement derrière son `pendingComponent`.
* Même factory, deux temporalités. Aucune route ne doit porter un loader client qui redonde avec
  une entrée `preload` pour la même donnée SANS raison de blocage documentée ; le cas légitime
  (crumbs avant peinture) est celui de #1527 et reste son unique sanction jusqu'à fusion puis
  revue des conventions.

## 4. Garde obligatoire — sur le VRAI artefact

**Défaut à détecter** : une route dont `staticData.preload` référence des query options que le
corps de la page n'utilise pas. C'est un second chemin de fetch installé — précisément ce que
#1527 a évité par construction en réutilisant les mêmes factories. Un garde qui vérifie une forme
au lieu d'un contenu est un faux négatif installé ; celui-ci vérifie un contenu.

**Assujettissement : le vrai artefact**, pas un modèle :

* Source de vérité n°1 : le VRAI arbre généré `apps/front/src/routeTree.gen.ts` importé au test
  (même choix que le contrat de crumbs, `breadcrumb-contract.test.tsx:20-33` : « walks the REAL
  generated route tree … does not construct a fixture route tree and does not regex-scan source »),
  avec le même auto-contrôle de vacuité (les counts doivent diverger si la marche visite 0 route).
* Source de vérité n°2 : le module de route RÉEL importé dynamiquement
  (`import('~/routes/…/$route')`) — on lit `Route.options.staticData.preload` exécuté sur les
  params du chemin réel, puis on inspecte le fichier de route et son hook de page.

**Algorithme du garde** (nouveau spec vitest
`apps/front/src/lib/navigation/preload-contract.test.tsx`, piné comme le contrat crumbs) :

1. Marcher `routeTree.gen` ; collecter chaque route dont `staticData.preload` existe.
2. Pour chacune, importer le fichier de route réel, exécuter `preload({ params: <params du
   chemin> })`, récupérer les clés concrètes `options.queryKey(variables)` (valeurs, pas symboles).
3. Collecter les clés utilisées par la PAGE : importer le module de hook d'état de la page
   (convention repo : `_use-*-state.ts` co-localisé ou hook inline du fichier de route ; pour les
   routes sans hook dédié, le corps du fichier de route lui-même) et intercepter les `useQuery`/
   `useSuspenseQuery` montés lors d'un rendu de test de la page avec ses vraies factories
   (technique éprouvée dans `$profileId.test.tsx` : mocks alignés sur le contrat réel
   `{queryKey(vars), fetcher(vars)}` des factories).
4. Échouer si une clé préchargée n'apparaît pas dans les clés consommées (message nommant
   `fichier:routeId` + la clé orpheline + la factory fautive). Tolérance assumée : une clé
   préchargée consommée uniquement par un enfant direct monté systématiquement par cette page
   (onglet index, drawer racine) compte comme consommée — la liste des enfants acceptés est
   déclarée dans le test, pas devinée.
5. **Limite connue (mutation adverse — « mauvaise factory, bonne clé »)** : le garde ne confronte
   QUE la clé concrète `options.queryKey(variables)` ; il n'identifie PAS la factory par son
   identité de module. Une entrée `preload` pourrait pointer vers une factory *différente* qui,
   par hasard, calcule la *même* clé avec un `fetcher` différent — le garde la laisserait passer
   (faux négatif de factory, pas de clé). Mitigations (plan-level, à traiter dans T1/T3 de
   l'implémentation, pas bloquant pour CE plan) : (a) resserrer le type §1.2 pour exiger que la
   factory provienne de `lib/query/*` via un type nominal « branded » ; (b) faire lire au garde le
   chemin du module de la factory préchargée et exiger qu'il soit le MÊME module que celui que la
   page importe. Le test unitaire T1 ne court-circuite pas cette mutation (il moque le routeur, pas
   l'unicité de la factory) ; un cas de test dédié « factory différente, clé identique → garde
   ROUGE (ou toléré par marqueur d'échappement documenté) » doit l'accompagner.

**Portée d'exécution** : suite vitest front existante (`pnpm --filter front test`), aucun nouvel
outil. Le garde est rouge-par-défaut pour toute NOUVELLE entrée `preload` incorrecte dès la tâche
T4 ; les pilotes T2/T3 doivent le passer vert.

## 5. Articulation tranchée avec #1527 (ouverte, non fusionnée)

* Ce plan n'édite PAS le code de la route détail profil tant que #1527 est ouverte : sa tâche
  pilote porte sur `$tenantId.tsx` (détail tenant) et `profiles.tsx` (liste profils), sans
  chevauchement de fichiers de code avec #1527 hormis `docs/guides/front/conventions.md` (voir
  §8 conflit assumé).
* À la fusion de #1527 : son loader client reste LA voie bloquante ; les entrées `preload` du détail
  profil sont ajoutées dans une tâche de suivi séparée (T7), après rebase, en gardant les deux
  mécanismes sur les mêmes factories (aucune collision de clés possible : mêmes `variables`,
  mêmes factories, donc même clé de cache).

## 6. Articulation tranchée avec `DEFAULT_QUERY_STALE_TIME_MS` (30 s, `router.tsx:27`)

* Au survol d'un lien, `ensureQueryData` ne refetch PAS une donnée fraîche (< 30 s) : le
  préchargement est donc gratuit sur les allers-retours rapides (liste ↔ détail) et ne double
  jamais la requête que le montage va faire (dedup par clé identique, factories partagées).
* Après 30 s de staleness, le survol refetch en arrière-plan : voulu. C'est exactement la
  sémantique « fresh enough » que le staleTime encode déjà pour le refocus d'onglet ; le
  préchargement hérite de la même politique plutôt que d'en inventer une troisième.
* Les factories qui fixent leur propre `staleTime` (`auth.ts:106` : `Infinity`,
  `needs-reconnect-accounts.ts:82` : `Infinity`, `staff-tenants.ts:569` et `tenant-posts.ts:223` :
  `30_000`) gardent leur valeur : `ensureQueryData` lit les options PAR requête, le comportement
  reste cohérent sans configuration supplémentaire.
* Interdit par ce plan : surcharger `staleTime`/`gcTime` au niveau des entrées de préchargement.
  Une entrée de preload n'est qu'une paire (factory, variables) — aucune option de cache neuve.
  Toute exception devra être tranchée dans une future record, pas absorbée ici.

## 7. Tâches (réduites, chacune livrable et testable seule)

Chemins exacts. Pas de TBD, pas de « gestion d'erreur appropriée ». Chaque tâche finit verte sur
ses portes nommées avant la suivante.

### T1 — Types + hook de branchement
* Fichiers créés : `apps/front/src/lib/navigation/route-preload.ts` (types §1.2 +
  `declare module '@tanstack/react-router' { interface StaticDataRouteOption { preload?: RoutePreload } }`),
  `apps/front/src/lib/query/preload-intent.ts` (`usePreloadIntentQueries()`, abonnement
  `onBeforeLoad`, `.catch(() => undefined)` silencieux, §1.1).
* Fichier modifié : `apps/front/src/components/app-shell/app-shell.tsx` (montage du hook, 1 ligne).
* Tests : `apps/front/src/lib/query/preload-intent.test.tsx` — (a) survol simulé →
  `ensureQueryData` appelé une fois par entrée avec la clé exacte de la factory ; (b) entrée déjà
  fraîche → zéro appel réseau (fetcher mocké qui compterait 2) ; (c) rejet de promesse → aucun
  toast/log/error, aucun state muté ; (d) 401 au préchargement → `triggerSessionInvalidated` NON
  appelé ; (e) désabonnement au démontage du shell.
* Portes : `pnpm --filter front exec vitest run src/lib/query/preload-intent.test.tsx` ;
  `pnpm --filter front typecheck`.

### T2 — Pilote détail tenant
* Fichier modifié : `apps/front/src/routes/authed/staff/tenants/$tenantId.tsx` — ajout
  `staticData.preload` retournant l'entrée unique `{ options: staffTenantDetailsQueryOptions,
  variables: { tenantId } }` (la factory déjà utilisée par la page via
  `useStaffTenantDetailsQuery` ET par son crumb entité).
* Tests : extension de `apps/front/src/routes/authed/staff/tenants/$tenantId.test.tsx` — la clé
  préchargée égale la clé consommée par la page (extraction des deux depuis les modules réels) ;
  e2e non requis (critère 2 absent : une régression du warming resterait visible au montage via
  QueryDisplay, cf. §9 mesure).
* Portes : vitest ciblé ; typecheck.

### T3 — Garde contractuel (rouge-par-défaut)
* Fichier créé : `apps/front/src/lib/navigation/preload-contract.test.tsx` (algorithme §4 complet,
  vacuité self-check inclus).
* Auto-prouve qu'il échoue : armature de test temporaire dans la PR (commit de démonstration
  revert avant push final) ajoutant une entrée `preload` fantôme sur une route pilote → le garde
  doit être ROUGE en nommant `fichier:routeId` + clé orpheline ; revert → vert.
* Portes : `pnpm --filter front exec vitest run src/lib/navigation/preload-contract.test.tsx` ;
  `pnpm --filter front typecheck`.

### T4 — Pilote liste profils (variables dérivées de l'URL)
* Fichier modifié : `apps/front/src/routes/authed/staff/profiles.tsx` — `staticData.preload`
  retournant `{ options: staffProfilesQueryOptions, variables: <variables API par défaut extraits
  de parseTableSearchParams(searchStr vide)> }`. Préchargé UNIQUEMENT la vue par défaut (q='',
  tri par défaut, taille par défaut) : jamais les curseurs/filtres non demandés.
* Test : le garde T3 reste vert (la clé par défaut préchargée est bien celle consommée au montage
  sans search params) ; cas de test dédié « search params présents → le montage consomme une autre
  clé, aucune requête supplémentaire déclenchée par le préchargement ».
* Portes : vitest ciblé ; typecheck.

### T5 — Conventions mises à jour
* Fichier modifié : `docs/guides/front/conventions.md`, nouvelle sous-section « Route query
  preloading (#487) » dans §Rendering Strategy : forme `staticData.preload`, silence des échecs,
  frontière avec les loaders client (§3), règle staleTime (§6), obligation du garde T3, exemple
  copié de T2/T4.
* Porte : relecture humaine (doc), rien d'exécutable.

### T6 — Mesure avant/après (§9)
* Fichiers créés : `apps/front/e2e/preload-waterfall.spec.ts` (@shell @487) + section Mesure dans
  le corps de PR (chiffres réels collés).
* Contenu précis en §9.

### T7 — Suivi post-fusion #1527 (hors périmètre de CETTE PR, listé pour séquence)
* Après fusion de #1527 et rebase : ajouter les entrées `preload` du détail profil
  (`$profileId.tsx`) sur `staffTenantDetailsQueryOptions` + `staffTenantProfileDetailsQueryOptions`
  ; le loader bloquant de #1527 reste ; vérifier dedup (une seule requête réseau au parcours
  survol→clic froid).

## 8. Ordre, risques, STOP-and-report

* Ordre : T1 → T2 → T3 → T4 → T5 → T6. T3 peut être écrite dès T1 mais doit être verte sur les
  pilotes T2/T4 avant tout commit final.
* Conflit assumé : T5 touche `docs/guides/front/conventions.md` aussi modifié par #1527 (sa
  sous-section « Client route loaders (#851) » dans §Rendering Strategy). Résolution additive : les
  deux sections coexistent, renvois croisés. **Ancrage et ordre concrets** : T5 insère la nouvelle
  sous-section « Route query preloading (#487) » dans §Rendering Strategy **immédiatement après**
  la sous-section « Client route loaders (#851) » de #1527 (et non avant), car le préchargement
  spéculatif (#487) est la contrepartie non bloquante du loader bloquant (#851) ; le texte de #487
  doit contenir un renvoi explicite « voir Client route loaders (#851) » et inversement la section
  #851 un renvoi « voir Route query preloading (#487) ». Si #1527 n'est pas encore fusionnée à
  l'exécution de T5, la sous-section #487 est insérée à la fin de §Rendering Strategy avec une note
  « à replacer après Client route loaders (#851) à la fusion de #1527 ». Fichier dans la liste
  additive du repo.
* STOP-and-report si : `onBeforeLoad` ne se déclenche pas lors d'un preload d'intention dans
  l'environnement de test réel (l'hypothèse §1.1 serait fausse, basculer sur l'événement suivant
  viable exige une re-décision) ; si un match de destination n'expose pas ses `staticData` au
  moment de l'abonnement ; si le garde T3 s'avère incapable d'importer un module de route réel
  (effets de bord SSR) — dans ce cas proposer le repli documenté (inspection du hook d'état de la
  page seul) plutôt que d'affaiblir le garde en silence.

## 9. Mesure — quoi et comment (pas « on mesurera »)

**Métrique unique** : temps entre le début de la navigation effective (clic) et la résolution de
la requête principale de la page, mesuré côté réseau Playwright. Secondaire : nombre de requêtes
réseau émises pour cette ressource (doit rester 1, preuve anti-double-fetch).

**Avant (tip develop, sans preload)** et **après (branche, avec)**, même protocole :

1. Spec Playwright `apps/front/e2e/preload-waterfall.spec.ts` : (a) mock API qui répond avec un
   délai fixe injectable (500 ms) sur `GET /staff/tenants/{id}` ; (b) scénario A : aller sur la
   liste tenants, HOVER le lien détail pendant > `preloadDelay` (défaut bibliothèque : 50 ms, non
   surchargé dans `router.tsx`), attendre que la requête
   mockée parte AVANT le clic (assertion `page.waitForResponse` pendant le hover), cliquer,
   chronométrer jusqu'à la réponse ; (c) scénario B (contrôle, même session, cache vidé) : clic
   sans hover préalable, même chronomètre.
2. Chiffres attendus et seuils : en A, la réponse arrive ≤ 50 ms après le clic (requête déjà en
   vol ou résolue) ; en B, ≈ délai mocké (≥ 500 ms). Nombre de requêtes GET pour la ressource :
   exactement 1 dans les deux scénarios (le dedup est prouvé, pas supposé).
3. Les deux nombres (A vs B) sont collés dans le corps de PR, avec les versions de commit. CI
   exécute la spec (shard front-e2e) : la mesure devient un garde permanent de non-régression du
   waterfall (si quelqu'un coupe le branchement, A dégénère en B et la spec échoue).
4. Hors e2e, mesure manuelle de complétude (DevTools, onglet Network, colonne Waterfall) sur
   `just dev-front` : capture collée dans la PR pour la route liste profils (T4), même protocole
   hover vs clic direct.

## 10. Non-vérifié / hypothèses restantes (honnêteté)

* Le timing exact `onBeforeLoad`-pendant-intent-preload est vérifié au niveau des types et de la
  doc du paquet, PAS encore exécuté dans le harnais vitest de ce repo : T1 contient le cas de test
  qui tranche ; l'échec déclenche le STOP-and-report §8.
* Le garde T3 suppose que chaque page pilote monte ses hooks de requête dans un rendu de test
  isolé sans stack serveur ; vrai pour les deux pilotes choisis, non généralisé à toutes les 60
  routes authed (63 ids dans `routeTree.gen.ts` moins les 3 nœuds de layout). **Couverture réelle
  du garde : seules les routes dont la page se rend sous vitest sans la pile serveur sont
  assujetties — aujourd'hui les deux pilotes, et toute route future ajoutant une entrée
  `preload` est aussitôt attrapée en rouge ; les ~58 routes restantes (page non rendable en test
  isolé) sont hors assujettissement jusqu'à leur migration par le même pattern pilote, suivie par
  #1592. Ce n'est pas une couverture « silencieuse » de toutes les 60 routes — c'est une
  couverture explicite des seules routes rendables, le reste étant un plan de migration nommé.**
* Les chiffres de mesure §9 sont des seuils ATTENDUS (mock 500 ms), pas des mesures relevées :
  ils le seront dans T6 et collés dans la PR.
