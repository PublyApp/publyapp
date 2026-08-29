# Preuve #1819 — `delay()` journalise à chaque appel

## 1. Preuve `delay` — test rouge (trace inconditionnel)

**État du code** : `delay()` avec `logger.warn(...)` inconditionnel (pas de `if (options.trace)`).

**Résultat** : ❌ ROUGE — les tests `delay(10) sans option ne journalise rien` et `sleep(10) ne journalise rien` échouent.

```
 FAIL  src/utils/any.utils.test.ts > delay(10) without options does not log a warning
 AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

 FAIL  src/utils/any.utils.test.ts > sleep(10) does not log a warning
```

**Commande** : `pnpm --filter shared-ts test -- --reporter=verbose`

---

## 2. Preuve `delay` — test vert (trace conditionnel)

**État du code** : `delay()` avec `if (options.trace) { logger.warn(...) }`, défaut `false`.

**Résultat** : ✅ VERT — 106 tests passent.

```
 Test Files  16 passed (16)
      Tests  106 passed (106)
```

**Commande** : `pnpm --filter shared-ts test -- --reporter=verbose`

---

## 3. Preuve `retry` — test rouge (boucle infinie avec `attempts: 2.5`)

**État du code** : `retry()` avec `if (attempts === 0) throw error;` (égalité stricte) et pas de validation d'entrée.

**Résultat** : ❌ ROUGE — les tests `retry throws RangeError for non-integer attempts (2.5)` et `retry throws RangeError for negative attempts (-1)` échouent (timeout après 5s = boucle infinie).

```
 FAIL  src/utils/retry-fn.test.ts > retry throws RangeError for non-integer attempts (2.5)
 FAIL  src/utils/retry-fn.test.ts > retry throws RangeError for negative attempts (-1)
 Test Files  1 failed | 15 passed (16)
      Tests  2 failed | 104 passed (106)
```

**Commande** : `timeout 15 pnpm --filter shared-ts test -- --reporter=verbose`

---

## 4. Preuve `retry` — test vert (validation + condition `<= 0`)

**État du code** : `retry()` avec validation `Number.isInteger(attempts) && attempts >= 0` et condition `if (attempts <= 0) throw error;`.

**Résultat** : ✅ VERT — 106 tests passent.

```
 Test Files  16 passed (16)
      Tests  106 passed (106)
```

**Commande** : `pnpm --filter shared-ts test -- --reporter=verbose`

---

## Résumé

| Test | Avant correction | Après correction |
|------|------------------|------------------|
| `delay(10)` sans option ne journalise rien | ❌ ROUGE | ✅ VERT |
| `delay(10, undefined, { trace: true })` journalise | ✅ VERT | ✅ VERT |
| `retry({ attempts: 2.5 })` échoue bruyamment | ❌ ROUGE (timeout) | ✅ VERT |
| `retry({ attempts: -1 })` échoue bruyamment | ❌ ROUGE (timeout) | ✅ VERT |

**Fichiers modifiés** :
- `packages/shared-ts/src/utils/any.utils.ts` — `delay()` paramétrable avec `trace: boolean` par défaut `false` + alias `sleep`
- `packages/shared-ts/src/utils/retry-fn.ts` — validation `attempts` entier non-négatif + condition `<= 0`
- `apps/front/e2e/helpers/settle.ts` — suppression du `sleep` local, import `@org/shared-ts/utils/any.utils`
- `apps/front/scripts/ci/smoke-start-server.mts` — suppression du `delay` local, import `@org/shared-ts/utils/any.utils`
- `packages/shared-ts/src/utils/any.utils.test.ts` — tests `delay` et `sleep`
- `packages/shared-ts/src/utils/retry-fn.test.ts` — tests `retry`
