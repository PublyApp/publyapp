# Ports and adapters in PublyApp

The rule itself: [`docs/conventions/ports-and-adapters.md`](../conventions/ports-and-adapters.md) (local copy of
the shared rule from radandevist/conventions).
This page only maps it onto PublyApp: what already follows it and what still has to move.

## Closest to the rule today

Shapes that follow the rule, or are close, with the gaps that remain:

| Need                       | Service                       | Port                                                       | Adapters                                                                                  | Gap                                                                                                                                                         |
| -------------------------- | ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mail (API)               | `EmailService`                | `IEmailSender`                                             | `ResendEmailAdapter`                                                                      | follows the rule since [#2514](https://github.com/PublyApp/publyapp/issues/2514): jobs call the service, one Resend adapter, tests use `MemoryEmailAdapter` |
| Aggregator key check (API) | `AggregatorConnectionService` | `IAggregatorAdapter` (`Kind`, `Describe`, `CheckKeyAsync`) | `ZernioAggregatorAdapter`                                                                 | follows the rule since [#2511](https://github.com/PublyApp/publyapp/issues/2511): one Zernio adapter behind the port                                        |
| Analytics (TS)             | `Analytics`                   | `IAnalytics.send`                                          | `PostHogNodeAnalyticsAdapter`, `PostHogBrowserAnalyticsAdapter`, `MemoryAnalyticsAdapter` | —                                                                                                                                                           |
| Shared TS logger           | `Logger`                      | `ILogger.write`                                            | `WinstonLoggerAdapter`, `StdoutJsonLoggerAdapter`, `BrowserConsoleLoggerAdapter`, `MemoryLoggerAdapter` | follows the rule since [#2516](https://github.com/PublyApp/publyapp/pull/2516): the service filters levels and redacts once; adapters only write          |
| Browser storage (front)    | `BrowserStorage`              | `IBrowserStorage` (`get`, `set`, `remove`)                 | `LocalStorageBrowserStorageAdapter`, `MemoryBrowserStorageAdapter`                        | follows the rule since [#2519](https://github.com/PublyApp/publyapp/pull/2519): the four callers use `browserStorage`; the inline pre-load script in `routes/__root.tsx` stays as is |

## Moving to the rule

| Need                  | Today                                                                                                                                                                                                                                                    | Target                                                                                          | Issue                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Social networks (API) | one adapter per API behind `ISocialPublisher` (`MastodonSocialAdapter` covers Mastodon and Pixelfed, plus `BlueskySocialAdapter`, `DiscordWebhookSocialAdapter`), but `PublishPublicationJobHandler` still injects `IPublishProvider` and calls it directly | a `PublishService` the job calls; it owns the journal and transitions and calls the publisher port | not tracked yet (the adapters landed in [#2518](https://github.com/PublyApp/publyapp/pull/2518))                        |

A new integration follows the rule from its first commit, not the shapes above: the rule is the model, these tables are only the to-do list.
