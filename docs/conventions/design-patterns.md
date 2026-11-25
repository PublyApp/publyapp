# Design patterns

Rules for every personal project (PublyApp, ShopKartOS, radan-ui, future ones), in TypeScript and in
.NET. Never DigitalPrevention. Written for agents; each rule says why. Owner decision of 2026-11-25.
Examples marked "example from PublyApp" are illustrations, not a list to copy.

"The book" is *Design Patterns: Elements of Reusable Object-Oriented Software* (Gamma, Helm, Johnson,
Vlissides). Its two principles:

- **Program to an interface, not an implementation.** Callers depend on the contract they use, so the
  implementation can change. "Interface" means a supertype or a small role type, not an interface per
  class: do not add one where there is no second implementation and no test seam.
- **Prefer composition to inheritance.** Assemble behaviour from small objects instead of building a
  deep class tree. Inheritance is still right for a genuine is-a with a fixed skeleton (see Template
  Method), not for reusing a method.

The rule that governs this page: **a pattern answers a problem; no problem, no pattern.** A pattern is a
name for a shape the code already needs, never a target. YAGNI: the cheapest pattern is the code you did
not add. Scan the table for the sign you actually see; open a card only when the sign is real.

## Sign → pattern

| Sign in the code                                                                  | Pattern                          |
| --------------------------------------------------------------------------------- | -------------------------------- |
| A vendor SDK/API type leaks into business code, or two classes call the same API    | Adapter                          |
| The same interface needs behaviour around it (redact, retry, cache, metrics)        | Decorator                        |
| The same interface needs access control, lazy load, or a security gate             | Proxy                            |
| Ordered checks, each may stop or pass, and the list changes per route              | Chain of Responsibility          |
| One event must reach listeners the publisher does not know                          | Observer                         |
| A `switch`/`if` on a kind chooses an algorithm, and new cases keep arriving         | Strategy                         |
| The same skeleton, with steps that vary per case                                   | Template Method                  |
| Callers repeat a multi-step sequence across several subsystems                      | Facade                           |
| `new` picks a concrete implementation from env, config or kind at one boundary      | Factory Method / Simple Factory  |
| A request must be stored, queued, retried, or undone later                          | Command                          |
| An optional collaborator forces `if (x is not null)` around every call              | Null Object                      |
| A part-whole tree where callers treat a leaf and a branch alike                     | Composite                        |
| Many optional parts, telescoping constructors, one immutable result                 | Builder                          |
| Behaviour changes with an explicit state and the transitions are the point         | State                            |

## Adapter

**Sign.** A vendor type (`Resend`, `HttpClient`, a browser global) appears in business code; two classes
call the same external API; tests cannot run without the vendor.

**Shape.** One port for our need; one adapter per library, translating only. Example from PublyApp:
`ResendEmailAdapter` implements `IEmailSender`; `EmailService` calls the port and never the vendor.
```csharp
public interface IEmailSender {
	Task<EmailSendReceipt> SendAsync(EmailRequest request, string? idempotencyKey = null, CancellationToken ct = default);
}

public class ResendEmailAdapter : IEmailSender { /* Resend types stay here */ }
```
**When NOT.** A pure library used directly (validation, dates, UI); one implementation with no swap and
no fake; an adapter that would only forward one method with no translation.
**Close cousins.** Decorator (same interface, adds behaviour); Proxy (same interface, controls access);
Facade (simplifies several subsystems, may not share their interface).

## Strategy

**Sign.** A `switch`/`if` on a kind chooses what to do; every new case edits several files; the caller
knows every concrete implementation.

**Shape.** One small interface, one implementation per case, one registry that picks. Example from
PublyApp: `ISocialPublisher` implementations are indexed by `SocialAdapterRegistry`; `RoutingPublishAdapter`
is the only `IPublishProvider` the publish job sees.
```csharp
public interface ISocialPublisher {
	IReadOnlySet<SocialProvider> Networks { get; }
	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken ct);
}
```
**When NOT.** One fixed algorithm; two branches unlikely to grow; the choice is made once at startup and
a plain function would do.
**Close cousins.** State (the object changes its own behaviour as it transitions); Factory (creates the
strategy); Adapter (different interface, same job).

## Facade

**Sign.** Callers repeat the same multi-step sequence across subsystems; a handler knows three services
and the order to call them; changing one step touches every caller.

**Shape.** One service method owns the sequence and the shared rules. Example from PublyApp: `EmailService`
renders templates and forwards through one `IEmailSender`; `Analytics` owns consent, masking and failure
containment before the adapter sends.
```ts
export class Analytics {
	async send(event: AnalyticsEvent): Promise<boolean> {
		if (!this.#hasConsent()) return false;
		const masked = maskAnalyticsEvent(event);
		await this.#adapter.send(masked);
		return true;
	}
}
```
**When NOT.** A pass-through with one method and one caller; the sequence is one call already; the facade
would become a god service that every feature edits.
**Close cousins.** Adapter (one interface, one subsystem); Mediator (colleagues talk through it);
Decorator (same interface, adds behaviour).

## Decorator

**Sign.** Behaviour must wrap an existing implementation and compose (redaction, retry, cache, metrics)
without editing it; the wrapper has the same interface and adds one concern.

**Shape.** Same interface, one wrapped field, delegate then change. Example from PublyApp:
`SanitizingLogEventSink` wraps another `ILogEventSink`; `SanitizingSinkConfigurationExtensions` puts it in
front of every durable sink.
```csharp
public sealed class SanitizingLogEventSink : ILogEventSink {
	private readonly ILogEventSink _Wrapped;
	public void Emit(LogEvent logEvent) => this._Wrapped.Emit(_Sanitize(logEvent));
}
```
**When NOT.** Only one fixed wrapper and it will never compose; the behaviour belongs inside the class;
the wrapper starts carrying business rules.
**Close cousins.** Proxy (same shape, different intent: control access, not add behaviour); Adapter
(different interface); Chain (several handlers, one may stop).

## Proxy

**Sign.** The same interface as the real object, but the surrogate controls access, loads lazily, logs, or
hides forbidden entries; the caller must not know.

**Shape.** Same interface, one inner object, one gate. Example from PublyApp:
`ReparsePointExclusionFileProvider` wraps `PhysicalFileProvider` and returns "not found" for symlinked
paths, so the static-file middleware cannot serve outside the uploads root.
```csharp
public IFileInfo GetFileInfo(string subpath) {
	var info = this._Inner.GetFileInfo(subpath);
	if (!info.Exists || _HasReparsePointInPath(info.PhysicalPath, subpath, out _)) {
		return new NotFoundFileInfo(info.Name);
	}
	return info;
}
```
**When NOT.** You can fix the real object; the gate is business logic that belongs in a service; you are
adding behaviour rather than controlling access (that is Decorator).
**Close cousins.** Decorator (adds behaviour); Adapter (changes interface); Facade (hides a subsystem).

## Factory Method / Simple Factory

**Sign.** `new` picks a concrete implementation from config, env or a kind at one boundary; callers must
not import the concrete types; the same construction is duplicated in several files.

**Shape.** One function or class method returns the port; the choice lives there. Example from PublyApp:
`resolveAdapter` returns the logger adapter for the environment; `CursorSortFieldHandlerFactory.Create`
builds a cursor handler from two selectors for every list service.
```ts
export const resolveAdapter = (env: LogEnv, server: boolean): ILogger => {
	if (env.NODE_ENV === 'test') return new MemoryLoggerAdapter();
	if (env.NODE_ENV === 'production') return server ? new StdoutJsonLoggerAdapter() : new BrowserConsoleLoggerAdapter();
	return winstonAdapter(server);
};
```
**When NOT.** One concrete type; no choice; `new` at the composition edge is already clear. Do not add a
factory for a class that will never have a second implementation.
**Close cousins.** Abstract Factory (a family of related products); Builder (step-by-step construction);
Strategy (behaviour selected at runtime, not construction).

## Template Method

**Sign.** The same skeleton repeats with one or two steps varying; subclasses would copy the transaction,
retry or logging around a different body.

**Shape.** A non-virtual public method owns the skeleton; protected abstract steps fill it. Example from
PublyApp: `EmailJobHandlerBase<TPayload>.HandleAsync` owns the transaction, idempotency and provider
contract; five handlers implement `PrepareAsync`, `ResolveTerminalIdentityAsync` and `Kind`.
```csharp
public abstract class EmailJobHandlerBase<TPayload> : IJobHandler {
	public async Task<JobOutcome> HandleAsync(JobContext context, CancellationToken ct) {
		var preparation = await this.PrepareAsync(context.DeserializePayload<TPayload>(), ct);
		// ... freeze, send, log, commit
	}
	protected abstract Task<EmailJobPreparation> PrepareAsync(TPayload payload, CancellationToken ct);
}
```
**When NOT.** Steps vary in order or can be skipped; composition or a strategy can do it; the hierarchy is
already deep. Subclassing to reuse one method is the smell.
**Close cousins.** Strategy (delegates the whole algorithm); Factory Method (one step creates a product);
Hook (an optional step, not a required one).

## Chain of Responsibility

**Sign.** Ordered checks where each may stop or pass; the set or order changes per route; auth and
validation repeat before every handler.

**Shape.** Each handler does its check, then calls `next`; it returns early to stop. Example from PublyApp:
`SessionAuthFilter`, `TenantPermissionFilter` and the other endpoint filters in `apps/api/Lib/Filters`
call `next(context)`.
```csharp
public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next) {
	if (string.IsNullOrEmpty(sessionToken)) return TypedProblems.Unauthorized("Session token is missing");
	return await next(context);
}
```
**When NOT.** Two fixed steps in a fixed order; every step must always run; the framework already
provides the pipeline (middleware, endpoint filters) — use it, do not rebuild it.
**Close cousins.** Decorator (one wrapper, always delegates); Middleware (the HTTP-level chain);
Strategy (one chosen, not a sequence).

## Observer

**Sign.** One event must reach listeners the publisher does not know; UI or tabs must stay in sync; the
publisher must not import the subscribers.

**Shape.** A publish/subscribe pair: one side posts, the other subscribes and unsubscribes. Example from PublyApp: `postBroadcast` publishes on a
`BroadcastChannel`; `useBroadcastSync` subscribes for a component's lifetime (auth, theme, locale sync).
The platform owns the subject; our code is the publisher/subscriber seam.
```ts
export const postBroadcast = <T>(channelName: string, data: T): void => {
	const channel = new BroadcastChannel(channelName);
	channel.postMessage({ tab: TAB_ID, data });
	channel.close();
};
```
**When NOT.** One known callee (call it); strict ordering or a transaction is required; an event bus is
used to avoid a direct dependency that is actually fine.
**Close cousins.** Mediator (a central hub knows the colleagues); Pub/Sub (a broker, cross-process);
Chain (one path, may stop).

## Command

**Sign.** A request must be stored, queued, retried, audited or undone later; the invoker must not know
the receiver; work runs in another process.

**Shape.** A payload object plus an executor keyed by a stable type. Example from PublyApp:
`JobDefinition<TPayload>` describes the queued command; `IJobHandler` executes it by `JobType`, and the
queue owns retries and dead letters.
```csharp
public interface IJobHandler {
	string JobType { get; }
	Task<JobOutcome> HandleAsync(JobContext context, CancellationToken ct);
}
```
**When NOT.** A synchronous in-process call with no retry, store or audit; a method call is enough.
**Close cousins.** Strategy (an algorithm, not a request); Observer (notification, not execution);
Memento (the state needed to undo).

## Null Object

**Sign.** `if (x is not null)` around every call; an optional collaborator is passed as `null`; tests
invent a fake that does nothing.

**Shape.** A real implementation that does nothing, so callers call unconditionally. Example from
PublyApp: `BlueskySocialAdapter` falls back to `NullLogger<BlueskySocialAdapter>.Instance` when no logger
is supplied.
```csharp
this._Logger = logger ?? NullLogger<BlueskySocialAdapter>.Instance;
```
**When NOT.** Absence is meaningful and must be handled; the no-op would hide a missing dependency or a
failed wiring; the operation must report an error (use a result type, not silence).
**Close cousins.** Proxy (controls access); Special Case (a meaningful default); Optional (the type says
"may be absent").

## The other GoF patterns

Each line says when it would matter; none is a target.

- **Abstract Factory** — a family of related products must vary together (a theme kit, a cloud SDK family); we have no such family today.
- **Builder** — one immutable object has many optional parts and telescoping constructors; object initializers cover PublyApp today, so no builder.
- **Prototype** — configured instances are cloned instead of rebuilt; matters for expensive parsed templates, not for our small records.
- **Singleton** — exactly one instance process-wide; use the DI container lifetime, see below, never a static `Instance`.
- **Bridge** — abstraction and implementation both vary independently (a report type × an export format); two dimensions are the sign, not one.
- **Composite** — a part-whole tree where leaf and branch share an operation (nested menus, comment threads, org units); PublyApp has no such tree yet.
- **Flyweight** — many fine-grained objects share immutable state (glyphs, map tiles); a cache with a proven memory problem, not a guess.
- **Interpreter** — a small grammar must be parsed and evaluated (filters, query languages); a parser library is usually the cheaper answer.
- **Iterator** — traverse a collection without exposing its internals; C# `IAsyncEnumerable` and TS iterators already are the pattern, use them.
- **Mediator** — many colleagues communicate in complex ways and a hub simplifies them; a service that already owns the flow is a facade, not a mediator.
- **Memento** — undo or a snapshot must restore prior state; matters for editors, not for append-only rows.
- **State** — behaviour changes with an explicit state and the transitions are the point; an enum field plus a `switch` is enough until per-state behaviour appears.
- **Visitor** — a stable object tree gains new operations; our Roslyn analyzers traverse `DescendantNodes` in `packages/lint-cs`; a visitor pays only when several operations share one traversal.

## Singleton

Use the DI container lifetime: `AddSingleton<T>()` in C#, or one module-level instance in TypeScript
(`export const logger = ...`). Never a class with a static `Instance` and a private constructor: it hides
the dependency, cannot be faked in tests, and survives a test run with the wrong state. Example from
PublyApp: `AddSocialAdapter<TAdapter>` registers one adapter as a singleton and forwards every port it
implements to that same instance.
