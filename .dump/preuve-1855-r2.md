# Preuve — PR #1855 Ronde 2 : le message d'erreur montre du charabia à l'utilisateur

## Défaut reproduit

Les clés `invite-invalid-cell-boolean` et `invite-invalid-cell-error` (en et fr) contenaient `{{cell: (cell )}}` — syntaxe inventée, non i18next. L'utilisateur voyait ce texte brut à l'écran, en toutes langues et en toutes circonstances (avec ou sans référence de cellule).

## Preuve Rouge (test écrit avant correctif)

Test : `renderInvalidCellMessage renders clear words, never raw interpolation markup > (en): boolean cell WITH a reference shows the reference, no "{{"`

```
stdout | ... > (en): boolean WITH cell →
  "Column \"level\"{{cell: (cell )}}contains a boolean (1), not text. Replace it with a text value, then try again."

AssertionError: expected 'Column "level"{{cell: (cell )}}contai…' not to contain '{{'
Expected: "{{"
Received: "Column "level"{{cell: (cell )}}contains a boolean (1), not text. Replace it with a text value, then try again."
```

Les 8 tests échouaient, 4 en + 4 fr, avec et sans référence de cellule — `{{cell: (cell )}}` apparaissait dans chaque sortie.

## Correctif appliqué

1. **`en/common.json`** — 2 anciennes clés remplacées par 4 nouvelles :
   - `invite-invalid-cell-boolean-no-cell` : `Column "{{column}}" contains a boolean...`
   - `invite-invalid-cell-boolean-with-cell` : `Column "{{column}}" (cell {{cell}}) contains a boolean...`
   - `invite-invalid-cell-error-no-cell` : `Column "{{column}}" contains a formula error...`
   - `invite-invalid-cell-error-with-cell` : `Column "{{column}}" (cell {{cell}}) contains a formula error...`

2. **`fr/common.json`** — même découpe, même forme, en français.

3. **`renderInvalidCellMessage`** dans `_invite-user-form-state.ts` : choisit la variante `-with-cell` ou `-no-cell` selon `Boolean(invalidCell.cell)`. La garde `if/else` remplace le ternaire implicite ; la fonction n'ajoute aucun formateur i18next maison.

4. **Test** — `render-invalid-cell-message.test.ts` : rend les messages via l'i18next réel (`createI18nFromResources` + les bundles réels), puis assert `not.toContain('{{')` et `not.toContain('}}')`. Couvre les 2 langues × 2 kinds × 2 états de cell = 8 assertions.

## Preuve Vert (après correctif)

```
stdout | ... > (en): boolean WITH cell →
  "Column \"level\" (cell B2) contains a boolean (1), not text. Replace it with a text value, then try again."
stdout | ... > (en): boolean WITHOUT cell →
  "Column \"level\" contains a boolean (1), not text. Replace it with a text value, then try again."
stdout | ... > (en): formula-error WITH cell →
  "Column \"email\" (cell A3) contains a formula error (#REF!). Fix the formula, then try again."
stdout | ... > (en): formula-error WITHOUT cell →
  "Column \"email\" contains a formula error (#REF!). Fix the formula, then try again."
... (mêmes résultats en fr)
```

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Mutation adverse

Remis `{{cell: (cell )}}` dans `en/common.json` clé `invite-invalid-cell-boolean-with-cell` uniquement (fr intact) :

```
 FAIL  ... > (en): boolean cell WITH a reference shows the reference, no "{{"
   → expected 'Column "level"{{cell: (cell )}}contai…' not to contain '{{'
   Received: "Column "level"{{cell: (cell )}}contains a boolean (1), not text..."
```

1 test rouge sur 8, le test `(en): boolean cell WITH a reference` — prouve que la garde couvre bien les deux langues (si fr cassé à la place, c'est `(fr): boolean cell WITH a reference)` qui serait rouge).

## Autres vérifications

- **`_invite-user-form-state.test.ts`** : `56 passed (56)` — aucune régression dans la suite existante.
- **Aucune autre clé cassée** : `grep '{{[^}]*:' src/i18n/` ne retourne rien. Aucune autre locale dans le dépôt n'utilise cette syntaxe inventée.
- **Aucun formateur i18next ajouté**, aucune désactivation de garde existante.
