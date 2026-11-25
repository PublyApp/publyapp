# SOLID

Rules for every personal project (PublyApp, ShopKartOS, radan-ui, future ones), in TypeScript and in
.NET. Never DigitalPrevention. Written for agents; each rule says why. Owner decision of 2026-11-25.
Examples marked "example from PublyApp" are illustrations, not a list to copy. The « I » and « D » are the
same seam as [ports and adapters](ports-and-adapters.md), which is the detailed rule.

## S — Single responsibility

**Rule.** One module, class or function changes for one reason: one actor or one job.

**Sign.** The name needs "And"; the file imports two unrelated domains; a test mocks a database to check
a string; two teams edit the same file for different features.

**Example from PublyApp.** `PublishValidationService` answers one question — is this content publishable
for these destinations? — and returns a `PublishContentFailure`. `PublishNowService` orchestrates the
write. Keep that boundary: validation stays pure, orchestration owns the transaction.

```csharp
public static PublishContentFailure? ValidateDestination(
	EffectiveContent content,
	SocialAccount account,
	Func<SocialProvider, bool>? isProviderEnabled = null)
```

**Why.** A class with two reasons is edited for one and broken for the other; its tests cannot say which
contract failed.

## O — Open/closed

**Rule.** Add a new case by adding code, not by editing working code: a new provider, kind or export is
a new file plus one registration, and the caller does not change.

**Sign.** Every new case edits the same `switch` in several files; a `default:` branch throws "unhandled"
and is touched on every release; a caller knows every concrete implementation.

**Example from PublyApp.** A network that can publish implements `ISocialPublisher`; `SocialAdapterRegistry`
builds the lookup once, and `RoutingPublishAdapter` routes by `request.Provider`. Adding a network does not
edit the publish job.

```csharp
public interface ISocialPublisher {
	IReadOnlySet<SocialProvider> Networks { get; }
	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken ct);
	Task<ReconcileResult> ReconcileAsync(ReconcileRequest request, CancellationToken ct);
}
```

**Why.** Each edit of a working branch can break a case nobody tested. Add the seam only where the set of
cases is genuinely open (providers, integrations); do not invent one for a value that never changes.

## L — Liskov substitution

**Rule.** An implementation of a type must be usable wherever that type is promised, without the caller
checking which implementation it got or catching a surprise refusal.

**Sign.** A method throws `NotSupportedException` / `NotImplementedException`; the caller does
`if (x is ConcreteA)`; an override narrows accepted input or skips a documented side effect.

**Example from PublyApp.** `ISocialPublisher` contains only what every publisher can honor. A network that
cannot publish does not implement the port; `SocialAdapterRegistry.Publisher` refuses an unknown network
at lookup instead of returning an object whose method throws.

```csharp
public ISocialPublisher Publisher(SocialProvider network) =>
	this._Publishers.TryGetValue(network, out var publisher)
		? publisher
		: throw new UnsupportedNetworkException(network, "publisher");
```

**Why.** A lying subtype turns a compile-time promise into a runtime branch in every caller, and the
failure lands far from the cause.

## I — Interface segregation

**Rule.** A caller depends on a small role interface with only what it uses; one need per port.

**Sign.** An interface has methods half its callers never call; a test fake implements twelve members and
throws on nine; a class implements a port and leaves the unused methods empty.

**Example from PublyApp.** `IEmailSender` has one method; `ISocialPublisher` has the three members this
seam needs. Callers inject the service, the service injects the port.

```csharp
public interface IEmailSender {
	Task<EmailSendReceipt> SendAsync(
		EmailRequest request, string? idempotencyKey = null, CancellationToken ct = default);
}
```

**Why.** A fat interface couples every caller to every change, and forces fakes that hide the one method
the test cares about. See [ports and adapters](ports-and-adapters.md) for the full seam.

## D — Dependency inversion

**Rule.** High-level policy depends on abstractions; only the wiring names concrete adapters and libraries.

**Sign.** A handler calls `new ResendEmailAdapter()`; a service imports the vendor SDK; an `if (isServer)`
or an environment check sits in business code; the test needs a live API key.

**Example from PublyApp.** `EmailService` holds `IEmailSender`; `ServiceRegistration` is the only production place
that names `ResendEmailAdapter`. Tests swap in `MemoryEmailAdapter` and assert on what it received.

```csharp
public EmailService(IEmailSender emailSender) { ... }              // policy
builder.Services.AddSingleton<IEmailSender, ResendEmailAdapter>(); // wiring
```

**Why.** The policy stays testable and the vendor stays replaceable. This is the D of SOLID and the same
rule as [ports and adapters](ports-and-adapters.md): business code calls the service, never the adapter.
