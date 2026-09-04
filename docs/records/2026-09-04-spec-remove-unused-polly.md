# Remove the Unused Polly Dependency

## Context

The API declares Polly as a direct dependency, but tracked application code does not use Polly
APIs. PublyApp already owns the resilience behaviour it needs through typed job outcomes, job
retry/backoff policy, and provider adapters.

## Decision

Remove the centrally pinned Polly version and the API package reference. Do not add a replacement
package, a generic resilience facade, or a new guard. The current README already has no Polly
mention, so it remains unchanged.

## Boundaries

- Domain and job outcome types remain unchanged.
- Retry, backoff, jitter, and attempt ceilings remain owned by the job engine.
- Provider-specific timeouts and transient/permanent error classification remain in adapters.
- Existing local circuit breakers remain local; new ones require a concrete provider failure mode.
- No runtime behaviour or public contract is intentionally changed.

## Alternatives Rejected

1. Replace Polly with another general resilience library. This preserves an abstraction the product
   does not currently use.
2. Adopt `Microsoft.Extensions.Http.Resilience`. It still brings Polly transitively and adds no
   value while there is no pipeline call site.
3. Build an internal resilience framework. This would duplicate the existing job and adapter
   boundaries and create new maintenance work.

## Verification

- Confirm no tracked C# source references Polly namespaces or APIs.
- Restore dependencies and build the API after removal.
- Confirm the generated dependency assets no longer contain a direct Polly dependency from the API.
- Run repository formatting/diff checks for the changed files.
