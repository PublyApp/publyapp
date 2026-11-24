<!-- Verbatim copy of radandevist/conventions rules/architecture/ports-and-adapters.md at 28e0fd8. Do not edit here: change the rule in radandevist/conventions, then copy it again. This copy is replaced by the installed @radandevist/conventions package once PublyApp depends on it. -->

# Ports and adapters

Rules for every personal project (PublyApp, ShopKartOS, radan-ui, future ones), in TypeScript and in
.NET. Never DigitalPrevention. Written for agents; each rule says why. Owner decisions of 2026-11-24.
The names below (logger, e-mail, Mastodon) are examples taken from PublyApp, not a list to copy.

## 0. Scope

The rule covers code with **side effects or input/output**: logs, e-mail, SMS, analytics, external HTTP
APIs, file or blob storage, browser storage, queues, the console. Pure libraries (validation such as
zod, date or string helpers, UI frameworks) are used directly. Why: a port is worth its cost only where
you need to swap the outside world, fake it in tests, or apply a shared rule (redaction, consent)
before it leaves the process.

## 1. Three layers: service → port → adapters

```
your code ──► Service                       (what the code calls; does the shared work ONCE)
                 │
                 ▼
              IPort                         (a small interface: one need)
                 │
                 ▼
              <Library><Function>Adapter    (one per library or API; only the outside call)
```

- **The service does the shared work once**: level filtering, redaction of personal data, consent,
  validation, retries. Why: written once, it cannot be forgotten by one adapter. If every adapter
  implemented the full contract, each would repeat that work, and one missing call would leak data.
- **A port covers one need** (interface segregation, the « I » of SOLID): one method, or a few methods
  that are always used together. `ILogger.write(entry)`, `IEmailSender.SendAsync(request)`,
  `ISocialPublisher.PublishAsync(post)`. Why: a caller depends only on what it uses, an adapter stays
  small, and no interface grows into a god class.
- **An adapter only translates** for its library or API. It holds no business rule, no `if` on the
  environment, no filtering and no redaction. Why: the adapters stay swappable and small.
- **One adapter per library or external API; it may implement several ports.** Two classes that call
  the same API are a defect. Example: connecting an account and publishing both talk to Mastodon, so
  one `MastodonSocialAdapter` implements `ISocialConnector` and `ISocialPublisher`. A network that can
  only publish implements only `ISocialPublisher`, never a method that throws "not supported". Why: the
  API's URLs, errors and tokens must be known in one place.
- **Business code (controllers, jobs, components) calls the service only**, never a port or an
  adapter. The port is known by the service, the wiring and tests; adapters are known by the wiring
  (`index.ts`, DI registration, or a small registry that picks the adapter per account or network) and
  by tests. Why: then changing or adding an adapter touches the wiring alone, never a caller. The
  service exists even when its shared work is small (a journal entry, encrypting a token): it is the
  one place that work will grow.
- **Tests use a memory adapter** (`MemoryLoggerAdapter`, `MemoryEmailAdapter`) and assert on what it
  received, never by spying on `console` or a global. Why: a spy still passes when the code stops
  writing, so it cannot prove "written, and without the secret".

## 2. Names

- **Service: named for its function**: `Logger`, `EmailService`, `Analytics`. Why: it is what callers
  see; the plain name reads best at the call site.
- **Port: `I` + the role it plays**, as a noun (the service does not implement its own port: `Logger`
  uses an `ILogger` adapter, it is not one): `ILogger`, `IEmailSender`, `ISmsSender`,
  `ISocialPublisher`. In .NET, never reuse a framework name (`Microsoft.Extensions.Logging.ILogger`):
  pick another role noun (`ILogWriter`). Why: the name says what an adapter must be, and a clash with a
  framework type causes wrong imports.
- **Adapter: library (or API, or medium) + function + `Adapter`**: `WinstonLoggerAdapter`,
  `JsonLoggerAdapter`, `MemoryLoggerAdapter`, `PostHogAnalyticsAdapter`, `ResendEmailAdapter`,
  `MastodonSocialAdapter`, `LocalDiskFileStorageAdapter`. Long is fine. Why: the name alone says what
  it wraps, which job, and that it is an adapter. Do not use `…Provider`, `…Sink`, `…Transport`,
  `…Client` or `…Store` for an adapter.
- **An environment variable names what it chooses**: `LOG_ADAPTER=winston|json`, not `LOG_SINK` or
  `LOG_FORMAT`. Why: an adapter has exactly one output format, so the variable picks the adapter.

## 3. Files

- **TypeScript: the service, port and adapter files are in kebab-case**, with the adapters in an
  `adapters/` folder next to the service. Other folders keep the project's own casing (UI file naming
  belongs to radan-ui). Why: the file name repeats the class name word for word, so an adapter is
  found by its name, and kebab-case avoids case-only renames that break on case-insensitive disks.

  ```
  lib/logger/
    logger.types.ts                    ILogger, LogEntry, LogLevel, LogMeta
    logger.ts                          class Logger (the service)
    log-redaction.ts
    log-level.ts
    index.ts                           export const logger + adapter choice
    adapters/
      winston-logger-adapter.ts        class WinstonLoggerAdapter implements ILogger
      json-logger-adapter.ts           class JsonLoggerAdapter implements ILogger
      memory-logger-adapter.ts         class MemoryLoggerAdapter implements ILogger
  ```

- **C# has one file per type, named exactly like the type** in PascalCase: `ResendEmailAdapter.cs`,
  `IEmailSender.cs`. Why: this is the .NET norm and what its tools expect; each language keeps its own.

## 4. Example

TypeScript (no constructor parameter properties, so it runs under Node type stripping):

```ts
export interface ILogger {
  write(entry: LogEntry): void;
}

export class Logger {
  readonly #adapter: ILogger;
  readonly #minLevel: LogLevel;

  constructor(adapter: ILogger, minLevel: LogLevel) {
    this.#adapter = adapter;
    this.#minLevel = minLevel;
  }

  debug = this.#at('debug');
  info = this.#at('info');
  warn = this.#at('warn');
  error = this.#at('error');

  #at(level: LogLevel) {
    return (message: string, meta?: LogMeta): void => {
      if (rank(level) < rank(this.#minLevel)) return;
      this.#adapter.write({ level, time: new Date(), message: redactText(message), meta: meta && redactMeta(meta) });
    };
  }
}

export class WinstonLoggerAdapter implements ILogger {
  // level 'debug': the service already filtered; the adapter must not filter again
  readonly #winston = winston.createLogger({ level: 'debug', transports: [new winston.transports.Console()] });

  write(entry: LogEntry): void {
    this.#winston.log({ ...entry.meta, level: entry.level, message: entry.message, timestamp: entry.time.toISOString() });
  }
}
```

C#, one adapter implementing two small ports, used only through the services:

```csharp
public interface ISocialConnector {
	Task<SocialAccount> ConnectAsync(ConnectRequest request, CancellationToken ct);
}

public interface ISocialPublisher {
	Task<PublishReceipt> PublishAsync(Post post, CancellationToken ct);
}

public class MastodonSocialAdapter(HttpClient http) : ISocialConnector, ISocialPublisher {
	public Task<SocialAccount> ConnectAsync(ConnectRequest request, CancellationToken ct) =>
		throw new NotImplementedException(); // POST /oauth/token
	public Task<PublishReceipt> PublishAsync(Post post, CancellationToken ct) =>
		throw new NotImplementedException(); // POST /api/v1/statuses
}

// wiring picks the adapter per network; the service does the shared work once
public class PublishService(ISocialAdapterRegistry adapters, IPublishAttemptJournal journal) {
	public async Task<PublishReceipt> PublishAsync(Post post, CancellationToken ct) {
		journal.Start(post);
		try {
			var receipt = await adapters.Publisher(post.Network).PublishAsync(post, ct);
			journal.Succeed(post, receipt);
			return receipt;
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			journal.Fail(post, ex);
			throw;
		}
	}
}

// business code: knows the service only
public class PublishNowEndpoint(PublishService publishing) {
	public Task Handle(Post post, CancellationToken ct) => publishing.PublishAsync(post, ct);
}
```
