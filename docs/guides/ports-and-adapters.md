# Ports and adapters in PublyApp

The rule itself: [`docs/conventions/ports-and-adapters.md`](../conventions/ports-and-adapters.md) (local copy of
the shared rule from radandevist/conventions).
This page only maps it onto PublyApp: what already follows it and what still has to move.

## Closest to the rule today

Shapes that follow the rule, or are close, with the gaps that remain:

| Need | Service | Port | Adapters | Gap |
|---|---|---|---|---|
| E-mail (API) | `EmailService` | `IEmailSender` | `ResendEmailAdapter` | follows the rule since [#2514](https://github.com/PublyApp/publyapp/issues/2514): jobs call the service, one Resend adapter, tests use `MemoryEmailAdapter` |
| Aggregator key check (API) | `AggregatorConnectionService` | `IAggregatorAdapter` (`Kind`, `Describe`, `CheckKeyAsync`) | `ZernioAggregatorAdapter` | follows the rule since [#2511](https://github.com/PublyApp/publyapp/issues/2511): one Zernio adapter behind the port |
| Analytics (TS) | `Analytics` | `IAnalytics.send` | `PostHogNodeAnalyticsAdapter`, `PostHogBrowserAnalyticsAdapter`, `MemoryAnalyticsAdapter` | — |

## Moving to the rule

| Need | Today | Target | Issue |
|---|---|---|---|
| Shared TS logger | `iso-logger.ts`: one class, `if (isServer)` in every method, no redaction | `Logger` → `ILogger.write` → `WinstonLoggerAdapter`, `JsonLoggerAdapter`, `MemoryLoggerAdapter` | [#2503](https://github.com/PublyApp/publyapp/issues/2503) |
| Social networks (API) | two classes per network call the same API (`MastodonClient` + `MastodonPublishProvider`, same for Bluesky) | one `…SocialAdapter` per network implementing `ISocialConnector` and/or `ISocialPublisher` | [#2509](https://github.com/PublyApp/publyapp/issues/2509) |
| Browser storage (front) | 5 files read `localStorage` directly (`ui-store.ts`, `cookie-consent-store.ts`, `selected-tenant-storage.ts`, `announcement-bar.tsx`, `routes/__root.tsx`); the inline pre-load script of `__root.tsx` stays as is | one service + port, `LocalStorageBrowserStorageAdapter` / `MemoryBrowserStorageAdapter` | [#2510](https://github.com/PublyApp/publyapp/issues/2510) |

A new integration follows the rule from its first commit, not the shapes above: the rule is the model, these tables are only the to-do list.
