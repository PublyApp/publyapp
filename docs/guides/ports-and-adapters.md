# Ports and adapters in PublyApp

The rule itself: [`docs/conventions/ports-and-adapters.md`](../conventions/ports-and-adapters.md) (local copy of
the shared rule from radandevist/conventions).
This page only maps it onto PublyApp: what already follows it and what still has to move.

## Closest to the rule today

No integration follows the rule completely yet. The closest shapes, with their gaps:

| Need | Service | Port | Adapters | Gap |
|---|---|---|---|---|
| E-mail (API) | `EmailService` | `IEmailSender` | `ResendEmailAdapter` | e-mail jobs call `IEmailSender` directly; Resend wrapped twice (`ResendEmailClientAdapter`); test double `FakeEmailSender` instead of `MemoryEmailAdapter` — [#2514](https://github.com/PublyApp/publyapp/issues/2514) |
| Aggregator key check (API) | `AggregatorConnectionService` | `IAggregatorAdapter` (`Kind`, `Describe`, `CheckKeyAsync`) | `ZernioAdapter` | port and adapter names pending — [#2511](https://github.com/PublyApp/publyapp/issues/2511) |

## Moving to the rule

| Need | Today | Target | Issue |
|---|---|---|---|
| Shared TS logger | `iso-logger.ts`: one class, `if (isServer)` in every method, no redaction | `Logger` → `ILogger.write` → `WinstonLoggerAdapter`, `JsonLoggerAdapter`, `MemoryLoggerAdapter` | [#2503](https://github.com/PublyApp/publyapp/issues/2503) |
| Analytics (TS) | `iso-analytics.ts`: PostHog hard-coded, no redaction | `Analytics` → `IAnalytics.send` → `PostHogNodeAnalyticsAdapter`, `PostHogBrowserAnalyticsAdapter`, `MemoryAnalyticsAdapter` | [#2508](https://github.com/PublyApp/publyapp/issues/2508) |
| Social networks (API) | two classes per network call the same API (`MastodonClient` + `MastodonPublishProvider`, same for Bluesky) | one `…SocialAdapter` per network implementing `ISocialConnector` and/or `ISocialPublisher` | [#2509](https://github.com/PublyApp/publyapp/issues/2509) |
| Browser storage (front) | 5 files read `localStorage` directly (`ui-store.ts`, `cookie-consent-store.ts`, `selected-tenant-storage.ts`, `announcement-bar.tsx`, `routes/__root.tsx`); the inline pre-load script of `__root.tsx` stays as is | one service + port, `LocalStorageBrowserStorageAdapter` / `MemoryBrowserStorageAdapter` | [#2510](https://github.com/PublyApp/publyapp/issues/2510) |
| Adapter names (API) | `…Provider`, `…Store`, `…Storage`, `ZernioAdapter` | `<Library><Function>Adapter` (`LocalDiskFileStorageAdapter`, `ZernioAggregatorAdapter`, …) | [#2511](https://github.com/PublyApp/publyapp/issues/2511) |

A new integration follows the rule from its first commit, not the shapes above: the rule is the model, these tables are only the to-do list.
