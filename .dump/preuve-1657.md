# Preuve — issue #1657 : la garde positive d'activation d'OpenTelemetry

## Modèle et niveau d'effort

**Modèle** : `claude-api:claude-fable-5` (modèle d'investigation/débogage assigné par l'opérateur).

**Niveau d'effort** : `low`. La tâche est un test symétrique exact d'une garde existante — le motif est copié depuis `OpenTelemetryActivationGate.Spec.cs`, seule la direction de l'assertion change. Aucune conception, aucune architecture, aucune exploration.

## Ce qui manquait

La garde négative (`ItShouldRegisterNoOpenTelemetryComponentsWhenTheOtlpEndpointVariableIsAbsent`) prouve « rien ne s'enregistre quand la variable est absente ». Mais elle est satisfaite par du code qui n'enregistre **jamais** rien — remplacer la sortie anticipée par un `return` inconditionnel la laisse verte. La conséquence : on peut désactiver complètement OpenTelemetry sans que rien ne le détecte.

## Ce qui a été ajouté

Un test symétrique dans le même fichier : `ItShouldRegisterOpenTelemetryComponentsWhenTheOtlpEndpointVariableIsPresent`. Avec `OTEL_EXPORTER_OTLP_ENDPOINT` posée, il vérifie que la collection de services porte bien les descripteurs `OpenTelemetry.*` — la même mesure sur le même artefact, seule la direction change.

## Preuve appariée (les trois étapes)

### Étape 1 — VERT (code actuel)

```
Passed!  - Failed: 0, Passed: 2, Skipped: 0, Total: 2
```

Les deux tests passent sur le code de production intact.

### Étape 2 — ROUGE (mutation : `|| true` dans la garde)

Mutation appliquée sur `OpenTelemetryConfigExtensions.cs:50` :

```csharp
if (string.IsNullOrWhiteSpace(otlpEndpoint) || true) {
    return builder;
}
```

Résultat :

```
Failed PublyApp.Api.Lib.Diagnostics.OpenTelemetryActivationGateSpec
    .ItShouldRegisterOpenTelemetryComponentsWhenTheOtlpEndpointVariableIsPresent [64 ms]
Error Message:
 Expected registeredOtelComponents not to be empty because
 with OTEL_EXPORTER_OTLP_ENDPOINT present, ConfigureOpenTelemetry() must
 attach the SDK, so the post-configuration service collection carries
 OpenTelemetry components. An empty collection here means the gate is
 broken in the other direction — the early return fires even when the
 variable is set..
```

Le nouveau test échoue exactement comme prévu — il détecte la désactivation.

### Étape 3 — VERT (code rétabli)

La mutation a été retirée. Vérification :

- `git status` propre (seul le fichier de test est modifié)
- Relecture manuelle de `OpenTelemetryConfigExtensions.cs` : la garde est revenue à l'état original

```
Passed!  - Failed: 0, Passed: 2, Skipped: 0, Total: 2
```

## Pourquoi ça marche

Le test inspecte la **vraie** collection de services après appel à `ConfigureOpenTelemetry()`, pas un modèle. Il épingle la variable d'environnement à l'entrée et la restaure dans un bloc `finally` — le même motif que la garde négative, pour éviter de contaminer les tests voisins.

La paire négative + positive est maintenant complète : on ne peut pas désactiver OpenTelemetry (dans aucune direction) sans qu'un test ne rougisse.
