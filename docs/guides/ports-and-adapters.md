# Ports and adapters in PublyApp

The rule itself lives in the shared conventions:
[rules/architecture/ports-and-adapters.md](https://github.com/radandevist/conventions/blob/main/rules/architecture/ports-and-adapters.md).
This page only maps it onto PublyApp: what already follows it and what still has to move.

## Already following the rule

| Need | Service | Port | Adapters |
|---|---|---|---|
| E-mail (API) | `EmailService` | `IEmailSender` | `ResendEmailAdapter`; tests: `FakeEmailSender` |
| Aggregator publishing (API) | publishing services | `IAggregatorAdapter` | `ZernioAdapter` |

## Moving to the rule

| Need | Today | Target | Issue |
|---|---|---|---|
| Shared TS logger | `iso-logger.ts`: one class, `if (isServer)` in every method, no redaction | `Logger` → `ILogger.write` → `WinstonLoggerAdapter`, `JsonLoggerAdapter`, `MemoryLoggerAdapter` | [#2503](https://github.com/PublyApp/publyapp/issues/2503) |
| Analytics (TS) | `iso-analytics.ts`: PostHog hard-coded, no redaction | `Analytics` → `IAnalytics.send` → `PostHogNodeAnalyticsAdapter`, `PostHogBrowserAnalyticsAdapter`, `MemoryAnalyticsAdapter` | [#2508](https://github.com/PublyApp/publyapp/issues/2508) |
| Social networks (API) | two classes per network call the same API (`MastodonClient` + `MastodonPublishProvider`, same for Bluesky) | one `…SocialAdapter` per network implementing `ISocialConnector` and/or `ISocialPublisher` | [#2509](https://github.com/PublyApp/publyapp/issues/2509) |
| Browser storage (front) | 7 files read `localStorage` directly | one service + port, `LocalStorageBrowserStorageAdapter` / `MemoryBrowserStorageAdapter` | [#2510](https://github.com/PublyApp/publyapp/issues/2510) |
| Adapter names (API) | `…Provider`, `…Store`, `…Storage`, `ZernioAdapter` | `<Library><Function>Adapter` (`LocalDiskFileStorageAdapter`, `ZernioAggregatorAdapter`, …) | [#2511](https://github.com/PublyApp/publyapp/issues/2511) |

A new integration follows the rule from its first commit; do not copy the old shapes above.
