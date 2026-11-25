<!-- Verbatim copy of radandevist/conventions rules/architecture/design-patterns.md at 412e0c2. Do not edit here: change the rule in radandevist/conventions, then copy it again. This copy is replaced by the installed @radandevist/conventions package once PublyApp depends on it. -->

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

The « I » and « D » seam of SOLID is [ports and adapters](ports-and-adapters.md), the detailed rule for
services, ports and adapters; this page names the shapes that sit on that seam.

**A pattern answers a problem; no problem, no pattern.** A pattern is a name for a shape the code
already needs, never a target. YAGNI: the cheapest pattern is the code you did not add. Scan the table
for the sign you actually see; open a card only when the sign is real. Two entries are not GoF patterns
(Simple Factory, Null Object) and are marked as such.

## Sign → pattern

| Sign in the code                                                                  | Pattern                          |
| --------------------------------------------------------------------------------- | -------------------------------- |
| A vendor SDK/API type leaks into business code, or two classes call the same API    | Adapter                          |
| A layer below the service must wrap an interface and compose (sink, cache, metrics) | Decorator                        |
| The same interface needs access control, lazy load, or a security gate             | Proxy                            |
| Ordered checks, each may stop or pass, and the list changes per route              | Chain of Responsibility          |
| One event must reach listeners the publisher does not know                          | Observer                         |
| A `switch`/`if` on a kind chooses an algorithm, and new cases keep arriving         | Strategy                         |
| The same skeleton, with steps that vary per case                                   | Template Method                  |
| Callers must reach a multi-class subsystem through one entry point                 | Facade                           |
| A function or keyed method picks the concrete implementation at one boundary       | Simple Factory (non-GoF; default) |
| A creator class lets subclasses decide which product one create step returns       | Factory Method (GoF)             |
| A request must be stored, queued, retried, or undone later                          | Command                          |
| An optional collaborator forces `if (x is not null)` around every call              | Null Object (non-GoF)            |

## Adapter

**Sign.** A vendor type (`Resend`, `HttpClient`, a browser global) appears in business code; two classes
call the same external API; tests cannot run without the vendor.

**Shape.** One port for our need; one adapter per library, translating only. Example: `ResendEmailAdapter`
implements `IEmailSender`; `EmailService` calls the port and never the vendor.
```csharp
public interface IEmailSender {
	Task<EmailSendReceipt> SendAsync(EmailRequest request, string? idempotencyKey = null, CancellationToken ct = default);
}
public class ResendEmailAdapter : IEmailSender { /* Resend types stay here */ }
```
**When NOT.** A pure library used directly; one implementation with no swap and no fake; a forwarding adapter.
**Close cousins.** Decorator (adds behaviour); Proxy (access control); Facade (several subsystems).

## Strategy

**Sign.** A `switch`/`if` on a kind chooses what to do; every new case edits several files; the caller
knows every concrete implementation.

**Shape.** One small interface, one implementation per case, one registry that picks. Example from
PublyApp: `ISocialPublisher` implementations are indexed by `SocialAdapterRegistry`. The publish job
still injects `IPublishProvider` directly: that is a gap against [ports and adapters](ports-and-adapters.md),
not a shape that already follows it. The target is a `PublishService` the job calls; the service owns
the journal and transitions and calls the port.
```csharp
public interface ISocialPublisher {
	IReadOnlySet<SocialProvider> Networks { get; }
	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken ct);
	Task<ReconcileResult> ReconcileAsync(ReconcileRequest request, CancellationToken ct);
}
```
**When NOT.** One fixed algorithm; two branches unlikely to grow; the choice is made once at startup. A
kind → data lookup is a table, not a class per kind.
**Close cousins.** State (self-transition); Factory (creates the strategy); Adapter (different interface).

## Facade (the service plays this role)

**Sign.** Callers must use several interfaces of one subsystem together; the same multi-step sequence
and its order repeat at every caller.

**Shape.** The book's Facade is a unified interface over a set of interfaces in a subsystem: one entry
point, the subsystem still does the work. In our code the **service** is that entry point, as defined by
[ports and adapters](ports-and-adapters.md). Example from PublyApp: `EmailService` owns render + send;
`Analytics` owns consent + mask + failure containment before the adapter. These are services, not a
separate "Facade" class: do not add a Facade on top of them, and do not call every service a Facade to
add.
```ts
export class Analytics {
	readonly #adapter: IAnalytics;
	readonly #hasConsent: AnalyticsConsent;

	constructor(adapter: IAnalytics, hasConsent: AnalyticsConsent) {
		this.#adapter = adapter;
		this.#hasConsent = hasConsent;
	}

	async send(event: AnalyticsEvent): Promise<boolean> {
		try {
			if (!this.#hasConsent()) return false;
			await this.#adapter.send(maskAnalyticsEvent(event));
			return true;
		} catch {
			return false;
		}
	}
}
```
**When NOT.** A pass-through with one method and one caller; the sequence is one call already; PublyApp
has no separate multi-subsystem Facade object, the service covers the role.
**Close cousins.** Adapter (one interface); Mediator (colleagues talk through a hub); Decorator (adds behaviour).

## Decorator

**Sign.** Behaviour must wrap an implementation and compose at a layer that is not already a service
rule — a sink in front of every durable sink, a cache, metrics — without editing the wrapped code; the
wrapper has the same interface and adds one concern.

**Shape.** Same interface, one wrapped field, delegate then change. Example: `SanitizingLogEventSink`
wraps another `ILogEventSink`; `SanitizingSinkConfigurationExtensions` puts it in front of every durable
sink. It is the process-wide redaction **backstop** at the Serilog sink layer, below the adapter, not the
template for wrapping a port.
```csharp
public sealed class SanitizingLogEventSink : ILogEventSink {
	private readonly ILogEventSink _Wrapped;
	public void Emit(LogEvent logEvent) => this._Wrapped.Emit(_Sanitize(logEvent));
}
```
**When NOT.** Redaction, consent, validation and retry are service rules, done once before the port
([ports and adapters](ports-and-adapters.md)); a `RedactingEmailSender` around a port leaks on one missed
wrapper. Not for one fixed wrapper either.
**Close cousins.** Proxy (controls access, not behaviour); Adapter (different interface); Chain (several handlers).

## Proxy

**Sign.** The same interface as the real object, but the surrogate controls access, loads lazily, logs, or
hides forbidden entries; the caller must not know.

**Shape.** Same interface, one inner object, one gate. Example from PublyApp:
`ReparsePointExclusionFileProvider` wraps `PhysicalFileProvider` and returns "not found" for symlinked
paths, so the static-file middleware cannot serve outside the uploads root.
```csharp
public IFileInfo GetFileInfo(string subpath) {
	var info = this._Inner.GetFileInfo(subpath);
	return !info.Exists || _HasReparsePointInPath(info.PhysicalPath, subpath, out _)
		? new NotFoundFileInfo(info.Name) : info;
}
```
**When NOT.** You can fix the real object; the gate is business logic that belongs in a service; you are
adding behaviour rather than controlling access (that is Decorator).
**Close cousins.** Decorator (adds behaviour); Adapter (changes interface); Facade (hides a subsystem).

## Simple Factory (non-GoF; our default)

**Sign.** `new` picks a concrete implementation from config, env or a kind at one boundary; callers must
not import the concrete types; the same construction is duplicated in several files.

**Shape.** One function or static method returns the port; the choice lives there. There is no creator
hierarchy and no overridable step, so this is not GoF Factory Method. Example: `resolveAdapter` returns the
logger adapter for the environment; `CursorSortFieldHandlerFactory.Create` builds a cursor handler from
two selectors. Both are Simple Factory.
```ts
export const resolveAdapter = (env: LogEnv, server: boolean): ILogger => {
	if (env.LOG_ADAPTER === 'winston') return winstonAdapter(server);
	if (env.LOG_ADAPTER === 'json') return new StdoutJsonLoggerAdapter();
	return autoAdapter(env, server);
};
```
**When NOT.** One concrete type; no choice; `new` at the composition edge is already clear. Do not add a
factory for a class that will never have a second implementation.
**Close cousins.** Factory Method (creator subclass hook); Abstract Factory (product family); Strategy (runtime choice).

## Factory Method (GoF)

**Sign.** A creator class defines the algorithm and one create step, and subclasses decide which product
that step returns; callers use the creator, never the constructor.

**Shape.** A concrete method owns the flow and calls a protected abstract create step. PublyApp has no
GoF Factory Method today: the two factories above are Simple Factory. Add this only when a creator
genuinely has subclasses that pick different products.
```ts
export abstract class ReportExporter {
	export(report: string): string {
		return this.createWriter().write(report);
	}
	protected abstract createWriter(): { write(report: string): string };
}
```
**When NOT.** One product; the choice is a keyed lookup (Simple Factory); no subclass will override the
step. Naming a switch function "Factory Method" makes an agent implement the wrong pattern.
**Close cousins.** Simple Factory (one function chooses); Abstract Factory (product family); Template Method (the skeleton).

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
**When NOT.** Steps vary in order or can be skipped; composition can do it; the hierarchy is already deep.
**Close cousins.** Strategy (whole algorithm); Factory Method (one step creates a product); Hook (optional step).

## Chain of Responsibility

**Sign.** Ordered checks where each may stop or pass; the set or order changes per route; auth and
validation repeat before every handler.

**Shape.** Each handler does its check, then calls `next`; it returns early to stop. Example from PublyApp:
`SessionAuthFilter`, `TenantPermissionFilter` and the other endpoint filters in `apps/api/Lib/Filters`
call `next(context)`.
```csharp
public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next) {
	var token = context.HttpContext.RequestServices.GetRequiredService<IRequestAuthContext>().SessionToken;
	if (string.IsNullOrEmpty(token)) return TypedProblems.Unauthorized("Session token is missing", ResponseKeys.Unauthorized);
	return await next(context);
}
```
**When NOT.** Two fixed steps; every step must always run; the framework already provides the pipeline.
**Close cousins.** Decorator (one wrapper, always delegates); Middleware (HTTP-level chain); Strategy (one chosen).

## Observer

**Sign.** One event must reach listeners the publisher does not know; UI or tabs must stay in sync; the
publisher must not import the subscribers.

**Shape.** A publish/subscribe pair: one side posts, the other subscribes and unsubscribes. Example:
`postBroadcast` publishes on a `BroadcastChannel`; `useBroadcastSync` subscribes for a component's
lifetime (auth, theme, locale sync). The platform owns the subject; our code is the seam.
```ts
export const postBroadcast = <T>(channelName: string, data: T): void => {
	const channel = new BroadcastChannel(channelName);
	channel.postMessage({ tab: TAB_ID, data });
	channel.close();
};
```
**When NOT.** One known callee (call it); strict ordering or a transaction is required; an event bus is
used to avoid a direct dependency that is actually fine.
**Close cousins.** Mediator (a hub knows the colleagues); Pub/Sub (a cross-process broker); Chain (one path).

## Command

**Sign.** A request must be stored, queued, retried, audited or undone later; the invoker must not know
the receiver; work runs in another process.

**Shape.** A payload object is the command, a definition describes its type, an executor runs it. Example:
the tenant-invitation payload is the command and `JobDefinition<TPayload>` its type descriptor (`JobType`,
priority, attempts, validation); `IJobHandler` executes it by `JobType`, the queue owns retries.
**When NOT.** A synchronous in-process call with no retry, store or audit; a method call is enough.

## Null Object (non-GoF)

**Sign.** `if (x is not null)` around every call; an optional collaborator is passed as `null`; tests
invent a fake that does nothing.

**Shape.** A real implementation that does nothing, so callers call unconditionally. Example from
PublyApp: `BlueskySocialAdapter` calls its logger without a null check and falls back to
`NullLogger<BlueskySocialAdapter>.Instance` at construction.
```csharp
this._Logger.LogInformation("Publishing {PublicationId}", request.PublicationId); // no null check
this._Logger = logger ?? NullLogger<BlueskySocialAdapter>.Instance;              // composition edge
```
**When NOT.** Absence is meaningful and must be handled; the no-op would hide a missing dependency or a
failed wiring; the operation must report an error. A required dependency should fail fast, so do not make
optional constructor injection the norm.
**Close cousins.** Proxy (controls access); Special Case (meaningful default); Optional (type says "may be absent").

## The other GoF patterns

- **Abstract Factory** — a family of related products must vary together (a theme kit, a cloud SDK family); we have no such family today.
- **Builder** — one immutable object has many optional parts and telescoping constructors; object initializers cover PublyApp today, so no builder.
- **Prototype** — configured instances are cloned instead of rebuilt; matters for expensive parsed templates, not for our small records.
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

Use the DI container lifetime: `AddSingleton<T>()` in C#, or one module-level instance in TypeScript.
Never a class with a static `Instance`. Example: `AddSocialAdapter<TAdapter>` registers one adapter as a
singleton and forwards every port it implements to that same instance.
