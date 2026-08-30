// Issue #255 spike: LOCAL DEV ORCHESTRATION ONLY. `dotnet run --project apps/apphost`
// starts a persistent Postgres (port 5454, data volume), the API (APP_ROLE=api),
// the worker (APP_ROLE=worker) and the front dev server, plus the Aspire dashboard
// (traces/metrics via OTel).
// Production (dokploy.yml) and e2e (docker-compose.test.yml) are deliberately untouched.
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;

var builder = DistributedApplication.CreateBuilder(args);

// Persistent local Postgres on the host's stable :5454 with a named data volume —
// survives AppHost restarts and replaces the former local compose Postgres.
//
// The password is the local-development literal `password`, the same constant in
// .env.example and in the justfile db-* recipes. It stays a secret parameter
// (the only WithPassword overload takes a ParameterResource), and Aspire allows
// any configuration source — e.g. a machine-local user-secrets entry
// `Parameters:postgres-password`, or an env var `Parameters__postgres-password` —
// to override the declared value. Such an override would silently swap the
// container's password for a different one while just db-migrate (hardwired to
// Password=password) and every DSN keep the literal, so fail loudly here instead
// (round-3 finding 4).
var postgresPassword = builder.AddParameter("postgres-password", "password", secret: true);
var configuredPassword = builder.Configuration["Parameters:postgres-password"];
if (string.IsNullOrEmpty(configuredPassword) || configuredPassword == "password") {
	// Absent: the declared literal wins. Present and equal: redundant but safe.
} else {
	Console.Error.WriteLine(
		"ERROR — a local configuration value overrides the AppHost's local development "
			+ "password (Parameters:postgres-password = "
				+ $"{configuredPassword.Length} characters, the expected value is the literal "
					+ "`password`). The local stack (.env.example, .env.development and the justfile "
						+ "db-* recipes) is hard-wired to Password=password: with a different "
							+ "value, just db-migrate and every connection string would silently "
								+ "disagree with the container. "
		+ "Actions: remove the generated value from the AppHost's secret store "
			+ "(dotnet user-secrets --id publyapp-apphost-255-spike remove "
				+ "\"Parameters:postgres-password\", file ~/.microsoft/usersecrets/"
					+ "publyapp-apphost-255-spike/secrets.json), unset the "
						+ "Parameters__postgres-password environment variable if it is set, then re-run "
							+ "`dotnet run --project apps/apphost` — or, if you really want a "
								+ "different password, change the constant in .env.example, "
									+ ".env.development and the justfile db-* recipes at the same time.");
	Environment.Exit(1);
}

var postgres = builder.AddPostgres("postgres").WithPassword(postgresPassword).WithHostPort(5454).WithDataVolume();
// Pre-flight: the postgres resource is pinned to host port 5454, and every app
// connects via POSTGRES_CONNECTION_STRING = "Host=localhost;Port=5454". If that
// port is already taken, the DCP postgres proxy cannot bind it and falls back to
// a RANDOM ephemeral port while the announced connection string still says 5454 —
// the API and worker would then silently connect to WHATEVER database occupies
// 5454 (observed live: another worktree's Postgres, with the worker writing into
// its job queue). DCP only logs that bind failure in its internal per-resource
// logs, never in this console, so fail loudly here before anything starts.
// The pre-flight call itself sits right before Build().Run(): the declarations
// above it are pure in-memory model construction, so a failure still fires
// before anything is started.
//
// The probe mirrors the process that will actually take the port — the DCP
// postgres proxy (Go, net.Listen): same loopback address, SO_REUSEADDR set. A
// bind WITHOUT SO_REUSEADDR false-positives after a hard kill (kill -9, crash,
// DCP teardown with open proxy connections): the proxy's accepted socket
// lingers bound on 127.0.0.1:5454 in FIN-WAIT-2 for up to tcp_fin_timeout
// (~60s), a plain bind then fails with errno 98 (Address already in use) on a
// perfectly free port, and the AppHost would block a healthy restart telling
// the user to "stop the container listening on 5454" when no listener exists
// (round-4 reviewer finding, kernel demo measured). .NET's managed Socket.Bind()
// sets SO_REUSEADDR on Linux by default (strace-verified), so the pin below is
// redundant today — it pins the intended DCP-mirroring semantic so a runtime
// default change cannot silently reintroduce the false positive. The paired
// proof lives in AppHostOrchestrationGuardSpec: the closing residue must read
// as FREE, an active listener must still fail loudly, and --plain-bind-preflight
// reproduces the exact kernel hazard (plain bind -> errno 98 on the residue).
//
// Issue #1926 point 1: HostPort5454IsFree used to catch ANY SocketException
// and answer "occupied". A permission error, a sandbox restriction, an absent
// IPv4 family all produced the misleading "stop the container listening on
// 5454" diagnosis — sending the user after a phantom listener. The
// classification now distinguishes AddressAlreadyInUse (the only verdict
// that means "occupied") from every other error: the latter throws a loud
// exception naming the real SocketError so the user follows the actual cause.
bool HostPort5454IsFree(bool plainBind = false) {
	if (plainBind) {
		// Guard-only variant: a TRUE plain bind (no SO_REUSEADDR) via libc.
		// .NET has no managed switch to drop the bind-time reuse default, so
		// the raw syscalls are the faithful way to demonstrate the round-4
		// kernel hazard inside the very pre-flight the guard protects.
		return RawPlainBind.CanBindLoopbackPort5454();
	}

	var probe = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
	probe.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
	// Issue #1954: the readback below is the real guard — the explicit
	// SetSocketOption above is the guarantee the readback checks. The readback
	// happens BEFORE Bind(), so .NET's managed bind-time SO_REUSEADDR default has
	// not been applied yet: without the explicit set the readback reads the
	// kernel default (0) and the throw fires before the bind — measured against
	// the architecture guard's residue test, whose shipped half asserts a FIXED
	// exit code of 0 on the residue; the unhandled exception exits the process
	// non-zero, so the assertion reddens the moment the readback disagrees. The
	// guard does NOT compare this probe's exit code to the --plain-bind-preflight
	// exit code — it asserts each against a fixed value (0 for the shipped
	// probe, 1 for the plain bind). A comment that named a comparison that does
	// not exist was a trap for the next reader.
	if (probe.GetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress) is not int reuseAddr
		|| reuseAddr == 0) {
		throw new InvalidOperationException(
			"The 5454 probe did not have SO_REUSEADDR enabled at the pre-bind "
				+ "readback — either the explicit SetSocketOption above was removed "
				+ "or the platform default no longer enables it. Either way the "
				+ "round-4 false positive (bind on closing residue = EADDRINUSE) "
				+ "is back. Re-enable the SetSocketOption line above, or update the "
				+ "probe to toggle the value explicitly."
		);
	}
	try {
		probe.Bind(new IPEndPoint(IPAddress.Loopback, 5454));
		return true;
	} catch (SocketException ex) {
		var outcome = ProbeBind.ClassifyBindException(ex);
		return HostPort5454IsFree_Outcome.Apply(outcome);
	} finally {
		probe.Dispose();
	}
}

// Issue #1926 point 1 — the --probe-bind-fault hook's entry point. Runs the
// production classification against a synthetic SocketException, then exits
// with the matching loud message. Free → exit 0 (no problem); Occupied →
// the same "stop the container listening on 5454" diagnosis the production
// probe would print (so the guard can also assert that path); Other → the
// diagnostic that names the real SocketError. Never reachable from the user
// flow — the dispatcher in main only routes here when the flag is present,
// and the flag is a guard-only test hook.
void ProbeBindFault(SocketError code) {
	var outcome = ProbeBind.ClassifyBindException(new SocketException((int)code));
	switch (outcome.Kind) {
		case ProbeBind.OutcomeKind.Free:
			// Issue #1953: --probe-bind-fault is a guard-only hook. Its whole job is
			// to classify a synthetic SocketException and exit so the architecture
			// guard (AppHostOrchestrationGuardSpec) can pin the verdict on a real
			// process. The Free branch was a plain `return` on the assumption that
			// `ClassifyBindException` never produced Free today — so the fall-through
			// was unreachable. If a future change makes Free reachable, falling
			// through boots the AppHost from a test hook (probe turns into a real
			// start). Throw instead: Free becoming reachable must be a loud failure
			// at the probe itself, not a silent boot. The architecture guard pins
			// this with --probe-bind-fault-kind Free below.
			ProbeBindFreeFallback();
			break;
		case ProbeBind.OutcomeKind.Occupied:
			FailLoudlyOnOccupiedPort();
			break;
		case ProbeBind.OutcomeKind.Other:
			ProbeBindFaultReporter.ReportAndExit(outcome);
			break;
		default:
			throw new InvalidOperationException(
				$"ProbeBindFault: unknown verdict ({outcome.Kind}).");
	}
}

void FailLoudlyOnOccupiedPort() {
	Console.Error.WriteLine(
		"ERROR — host port 5454 is already in use: the AppHost's DCP proxy "
			+ "would not be able to bind Postgres there (bind: address already in use), and the "
			+ "stack would silently continue on a random port, while "
			+ "POSTGRES_CONNECTION_STRING still announces Host=localhost;Port=5454. "
			+ "The API and worker would then connect to WHATEVER DATABASE OCCUPIES "
			+ "5454 — probably another project's local Postgres — and "
			+ "write to it without complaining.\n"
		+ "Actions: stop the process/container listening on 5454 (e.g. the leftover "
			+ "`publyapp-postgres` container: docker rm -f publyapp-postgres ; verify with: "
			+ "`ss -tlnp | grep 5454`), then re-run `dotnet run --project apps/apphost` — "
			+ "or, for a different port, change the 5454 in this AppHost AND in "
			+ "POSTGRES_CONNECTION_STRING in .env.development AND in the justfile "
			+ "db-* recipes, because everything is hard-wired to 5454.");
	Environment.Exit(1);
}

// Issue #1953: the loud-fail the Free branch of ProbeBindFault (and the
// --probe-bind-fault-kind Free drill) must produce. The Free branch is
// unreachable from the production classifier today — ClassifyBindException
// only returns Free on a successful bind, and the fault hook feeds it a
// synthetic SocketException. If a future change ever makes Free reachable,
// falling through would boot the AppHost from a guard-only test hook (probe
// turns into a real start). This function is the contract: Free becoming
// reachable must be a LOUD failure at the probe itself, not a silent boot.
// It throws — never writes to output and returns — so the process exits
// non-zero and the architecture guard pins the verdict.
void ProbeBindFreeFallback() {
	throw new InvalidOperationException(
		"--probe-bind-fault: the probe classified the port as FREE — "
			+ "the Free branch of ProbeBindFault is unreachable from the "
			+ "production classifier today and falling through would boot the "
			+ "AppHost from a guard-only test hook. If this path is now "
			+ "reachable, ClassifyBindException changed: a Free verdict from "
			+ "a synthetic SocketException must not silently start the "
			+ "application. Revert the classifier change, or if Free is "
			+ "intended, make the caller exit instead of falling through."
	);
}

// --hold-port-5454 (LOCAL DEV ORCHESTRATION ONLY, guard support): a minimal test
// server that binds 127.0.0.1:5454 exactly like the DCP postgres proxy (Go
// net.Listen: SO_REUSEADDR set), accepts one connection and blocks forever.
// AppHostOrchestrationGuardSpec spawns this process and kills it (SIGKILL) to
// reproduce the post-crash closing residue the pre-flight must not mistake for
// an occupied port. Never reachable from the user flow.
void HoldPort5454Forever() {
	var listener = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
	listener.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
	listener.Bind(new IPEndPoint(IPAddress.Loopback, 5454));
	listener.Listen(1);
	using var connection = listener.Accept();
	Console.WriteLine("hold-port-5454: accepted");
	Thread.Sleep(Timeout.Infinite);
}

// --dump-model (LOCAL DEV ORCHESTRATION ONLY, guard support): print the claims
// the architecture guard witnesses on the CONSTRUCTED model — the named volume,
// the pinned host port, the excluded launch profile — then exit 0. The guard
// asserts on this artifact instead of scanning the AppHost's source text.
void DumpModelClaims() {
	foreach (var resource in builder.Resources) {
		foreach (var mount in resource.Annotations.OfType<ContainerMountAnnotation>()) {
			Console.WriteLine($"mount {resource.Name} type={mount.Type} source={mount.Source} target={mount.Target}");
		}
		foreach (var endpoint in resource.Annotations.OfType<EndpointAnnotation>()) {
			Console.WriteLine($"endpoint {resource.Name} name={endpoint.Name} protocol={endpoint.Protocol} hostPort={endpoint.Port?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "<unset>"} targetPort={endpoint.TargetPort?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "<unset>"}");
		}
		if (resource.Annotations.OfType<ExcludeLaunchProfileAnnotation>().Any()) {
			Console.WriteLine($"launchProfile {resource.Name} excluded");
		}
		foreach (var profile in resource.Annotations.OfType<LaunchProfileAnnotation>()) {
			Console.WriteLine($"launchProfile {resource.Name} name={profile.LaunchProfileName}");
		}
		foreach (var profile in resource.Annotations.OfType<DefaultLaunchProfileAnnotation>()) {
			Console.WriteLine($"launchProfile {resource.Name} default={profile.LaunchProfileName}");
		}
	}
}

var publyDb = postgres.AddDatabase("publyapp-db", "publyapp_db");

// The app reads its DSN from POSTGRES_CONNECTION_STRING (AppEnvironment), not the
// Aspire-standard ConnectionStrings__ section, so mirror the database resource's
// runtime-resolved connection string under the variable the app already consumes.
//
// #1585: the two roles used to carry two byte-identical copies of this callback. The
// call stays per-role — each resource is still composed independently, which is what
// the original note was protecting — but the BODY now lives in one place, so the api
// and the worker cannot drift onto different variable names or different expressions
// without someone noticing. A drift there would be invisible at build time and would
// only show up as one of the two processes failing to reach the database at run time.
static IResourceBuilder<ProjectResource> WithPostgresConnectionString(
	IResourceBuilder<ProjectResource> project,
	IResourceBuilder<PostgresDatabaseResource> database
) {
	return project.WithEnvironment(context => {
		context.EnvironmentVariables["POSTGRES_CONNECTION_STRING"] =
			database.Resource.ConnectionStringExpression;
	});
}

static IResourceBuilder<ProjectResource> WithDevelopmentEnvironment(
	IResourceBuilder<ProjectResource> project
) {
	return project
		.WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
		.WithEnvironment("DOTNET_ENVIRONMENT", "Development");
}

var api = WithPostgresConnectionString(
		WithDevelopmentEnvironment(builder.AddProject<Projects.PublyApp_Api>("api").WithEnvironment("APP_ROLE", "api")),
		publyDb
	)
	.WaitFor(publyDb);

// Same binary, APP_ROLE=worker: job engine only, no HTTP server (design §3.2).
// launchProfileName: null — the worker has no HTTP endpoints, so it must not bind
// the API's port 5000 (DCP proxy fails with "address already in use" otherwise).
// No WaitFor(api): the worker's WorkerMigrationStartupGate already retries until
// pending migrations clear, which absorbs the boot-order race by design.
WithPostgresConnectionString(
		WithDevelopmentEnvironment(builder.AddProject<Projects.PublyApp_Api>("worker", launchProfileName: null).WithEnvironment("APP_ROLE", "worker")),
		publyDb
	)
	.WaitFor(publyDb);

// The shipped frontend in dev mode. TanStack Start dev server is Vite under the hood,
// so AddViteApp runs `pnpm dev` from apps/front. Injecting both base URLs means a fresh
// clone without .env.development still points at the orchestrated API (vite.config.ts
// uses ??= so explicit env wins over repo-root files either way).
builder.AddViteApp("front", "../front", "dev")
	.WithEnvironment("PUBLIC_API_BASE_URL", api.GetEndpoint("http"))
	.WithEnvironment("SERVER_API_BASE_URL", api.GetEndpoint("http"));

// ---- Local-dev guard hooks (LOCAL DEV ORCHESTRATION ONLY) -----------------
// The architecture guard (AppHostOrchestrationGuardSpec) drives this AppHost in
// three modes — none of these flags is part of the user flow:
//  * --dump-model            print the claims of the CONSTRUCTED model (named
//                            volume, pinned host port, excluded launch profile)
//                            and exit 0. Runs before the pre-flight so the
//                            guards do not depend on the machine's port state.
//  * --hold-port-5454        block as the minimal DCP-like server above; the
//                            guard kills this process with SIGKILL to
//                            reproduce the post-crash closing residue on
//                            127.0.0.1:5454.
//  * --preflight-only        run exactly the boot path's port pre-flight, then
//                            exit 0 (free) or 1 (occupied, loud message) —
//                            the guard uses it to prove the residue reads as
//                            FREE without booting DCP/docker. With the extra
//                            --plain-bind-preflight flag (Linux-only, see
//                            RawPlainBind) the probe drops SO_REUSEADDR (raw
//                            libc bind — the only faithful "plain" variant,
//                            .NET's managed bind sets reuse by default) so the
//                            guard can reproduce the round-4 kernel hazard: a
//                            plain bind against the closing residue exits 1
//                            with errno 98.
if (args.Contains("--dump-model")) {
	DumpModelClaims();
	return;
}

if (args.Contains("--probe-bind-fault")) {
	var idx = args.IndexOf("--probe-bind-fault");
	var codeName = idx + 1 < args.Length ? args[idx + 1] : null;
	var parsedCode = SocketError.Success;
	if (codeName is null || !Enum.TryParse<SocketError>(codeName, ignoreCase: true, out parsedCode)) {
		Console.Error.WriteLine(
			"ERROR — --probe-bind-fault expects a System.Net.Sockets.SocketError name "
				+ $"(e.g. AddressAlreadyInUse, AccessDenied). Received: {codeName ?? "<missing>"}. "
				+ "AppHostOrchestrationGuardSpec guard mode only.");
		Environment.Exit(2);
	}
	ProbeBindFault(parsedCode);
	// Issue #1953: ProbeBindFault exits for Occupied/Other and throws for Free
	// (the Free branch is the loud-fail the issue pins — see the throw inside
	// ProbeBindFault). The function never returns. FALLING THROUGH this block
	// (no return/throw/exit) would reach the pre-flight and boot the AppHost
	// from a guard-only test hook; a bare `return;` would instead exit 0
	// quietly, losing the verdict either way. Make the contract explicit: this
	// block must terminate the process, so an unconditional throw pins every
	// future path that forgets to.
	throw new InvalidOperationException(
		"--probe-bind-fault returned instead of exiting or throwing — the "
			+ "guard-only probe path fell through. The Free branch must throw (see "
			+ "ProbeBindFault), Occupied must call Environment.Exit(1), Other must "
			+ "call ProbeBindFaultReporter.ReportAndExit. A fall-through here would "
			+ "boot the AppHost from a test hook."
	);
}

// Issue #1953: a guard-only test hook that bypasses ClassifyBindException and
// forces the probe to emit a Free verdict. Lets the architecture guard witness
// the loud-fail path that #1953 added to ProbeBindFault without mutating the
// production classifier (which today never produces Free from a synthetic
// SocketException). If a future change ever makes Free reachable from the real
// classifier, the Free branch in ProbeBindFault already throws — so this
// synthetic-Free mode doubles as a regression drill for that path too. Not
// reachable from the user flow.
if (args.Contains("--probe-bind-fault-kind")) {
	var kindIdx = args.IndexOf("--probe-bind-fault-kind");
	var kindName = kindIdx + 1 < args.Length ? args[kindIdx + 1] : null;
	if (!Enum.TryParse<ProbeBind.OutcomeKind>(kindName, ignoreCase: true, out var forcedKind)) {
		Console.Error.WriteLine(
			"ERROR — --probe-bind-fault-kind expects Free, Occupied, or Other. "
				+ $"Received: {kindName ?? "<missing>"}. AppHostOrchestrationGuardSpec guard mode only.");
		Environment.Exit(2);
	}
	// Walk the same switch ProbeBindFault walks, but with the forced verdict, so
	// the guard sees the same code paths.
	switch (forcedKind) {
		case ProbeBind.OutcomeKind.Free:
			ProbeBindFreeFallback();
			break;
		case ProbeBind.OutcomeKind.Occupied:
			ProbeBindFault(SocketError.AddressAlreadyInUse);
			break;
		case ProbeBind.OutcomeKind.Other:
			ProbeBindFault(SocketError.AccessDenied);
			break;
		default:
			throw new InvalidOperationException($"--probe-bind-fault-kind: unknown kind ({forcedKind}).");
	}
	// Defensive: same fall-through pin as above.
	throw new InvalidOperationException(
		"--probe-bind-fault-kind returned without exiting — the guard-only "
			+ "Free/Occupied/Other drill path fell through."
	);
}

// --hold-port-5454 must skip the preflight: it IS the listener and the
// preflight would (correctly) report the port occupied, killing the test
// helper before it can accept the residue probe. The preflight is for the
// user-facing flows (boot and --preflight-only), not for this guard hook.
if (!args.Contains("--hold-port-5454")
	&& !HostPort5454IsFree(args.Contains("--plain-bind-preflight"))) {
	FailLoudlyOnOccupiedPort();
}

if (args.Contains("--preflight-only")) {
	// Guard-only standalone entry point (issue #1926 point 2). Sharing the
	// SAME call site with the boot path means there is exactly one call to
	// HostPort5454IsFree in the program: any future refactor that drops it
	// also drops the guard-only mode's check, which the architecture guard
	// catches immediately. This used to live as its own block with a second
	// call, which the compiler could not pin (two call sites, one of which
	// was the test's only exercise) — see point 2 of the round-3 review.
	Console.WriteLine("host port 5454 preflight: free");
	return;
}

if (args.Contains("--hold-port-5454")) {
	try {
		HoldPort5454Forever();
	} catch (SocketException ex) {
		Console.Error.WriteLine(
			"ERROR — hold-port-5454: cannot bind 127.0.0.1:5454 "
				+ $"(an active listener probably occupies it; {ex.Message}). "
				+ "Free the port then re-run the test.");
		Environment.Exit(1);
	}
}

builder.Build().Run();

// Guard-only raw plain bind (see HostPort5454IsFree). struct sockaddr_in on
// Linux: sin_family(2)=AF_INET, sin_port(2)=htons(5454), sin_addr(4)=127.0.0.1,
// sin_zero(8) — packed little-endian.
internal static partial class RawPlainBind {
	private const int AfInet = 2;      // AF_INET
	private const int SockStream = 1;  // SOCK_STREAM (Linux)
	private const int TcpProtocol = 6; // IPPROTO_TCP
	private const int Port = 5454;

	[DllImport("libc", SetLastError = true)]
	private static extern int socket(int domain, int type, int protocol);

	[DllImport("libc", SetLastError = true)]
	private static extern int bind(int sockfd, byte[] address, int length);

	[DllImport("libc", SetLastError = true)]
	private static extern int close(int fd);

	public static bool CanBindLoopbackPort5454() {
		if (!OperatingSystem.IsLinux()) {
			// The guard suite (AppHostOrchestrationGuardSpec) targets the Linux
			// CI runners like every libc-based check in this repo. Fail loudly
			// with the cause instead of a bare DllNotFoundException.
			throw new PlatformNotSupportedException(
				"--plain-bind-preflight uses raw libc bind semantics and is Linux-only "
					+ "(the AppHost guard suite targets the Linux CI runners)."
			);
		}

		var address = new byte[16];
		address[0] = AfInet;                // family, little-endian
		address[1] = 0;
		address[2] = Port >> 8;             // port, big-endian (network order)
		address[3] = Port & 0xFF;
		address[4] = 127;                   // 127.0.0.1
		address[5] = 0;
		address[6] = 0;
		address[7] = 1;

		var fd = socket(AfInet, SockStream, TcpProtocol);
		if (fd < 0) {
			// Cannot even create a probe socket (exotic sandbox): report as
			// occupied — a LOUD failure, never a silent pass.
			return false;
		}

		try {
			return bind(fd, address, address.Length) == 0;
		} finally {
			close(fd);
		}
	}
}

// Issue #1926 point 1 — probe bind-error classification. The OLD probe caught
// every SocketException and answered "occupied", so a permission error, a
// sandbox restriction, or an absent address family all became the misleading
// "stop the container listening on 5454" — sending the user after a
// phantom listener. Only AddressAlreadyInUse means "occupied"; any other
// SocketError is a real, named environment problem that the user must
// address (sandbox capabilities, IPv4 availability, NIC policy, ...).
//
// The classification is a single, side-effect-free switch over the
// SocketException so the production probe, the --probe-bind-fault guard
// hook, and any future caller all share the same mapping. Changing the
// mapping changes the user-visible verdict — that is what the architecture
// guard (see AppHostOrchestrationGuardSpec) witnesses end-to-end.
internal static partial class ProbeBind {
	public enum OutcomeKind { Free, Occupied, Other }

	public readonly record struct Outcome(OutcomeKind Kind, SocketError? Code, string Diagnostic) {
		public static Outcome Occupied(SocketError code) {
			return new(OutcomeKind.Occupied, code, $"SocketError.{code}");
		}
		public static Outcome Other(SocketError code, string message) {
			return new(OutcomeKind.Other, code, message);
		}
	}

	public static Outcome ClassifyBindException(SocketException ex) {
		var code = ex.SocketErrorCode;
		if (code == SocketError.AddressAlreadyInUse) {
			return Outcome.Occupied(code);
		}
		return Outcome.Other(
			code,
			$"SocketError.{code} (native errno: {ex.NativeErrorCode})");
	}
}

// Issue #1926 point 1 — the verdict the production probe applies to a
// classified outcome. Free and Occupied are normal; Other is the loud-fail
// path that names the real SocketError. The top-level local function uses
// this via static dispatch so the call site reads the same as the old
// `return false` while the failure path actually surfaces the cause.
internal static class HostPort5454IsFree_Outcome {
	public static bool Apply(ProbeBind.Outcome outcome) {
		switch (outcome.Kind) {
			case ProbeBind.OutcomeKind.Free:
				return true;
			case ProbeBind.OutcomeKind.Occupied:
				return false;
			case ProbeBind.OutcomeKind.Other:
				throw new InvalidOperationException(
					"AppHost pre-flight: cannot determine whether 127.0.0.1:5454 is free. "
						+ $"Real cause: {outcome.Diagnostic}. "
						+ "Actions: examine the process permissions (sandbox, capabilities, "
						+ "firewall), the availability of IPv4 on the loopback, and the network "
						+ "state before re-running `dotnet run --project apps/apphost`.");
			default:
				throw new InvalidOperationException(
					$"AppHost pre-flight: unknown verdict ({outcome.Kind}).");
		}
	}
}

// Issue #1926 point 1 — the --probe-bind-fault hook's reporting path. Same
// loud message as Apply's exception so the guard can assert against a
// process exit (not an in-process exception). The probe classification
// itself is the same one the production probe runs.
internal static class ProbeBindFaultReporter {
	public static void ReportAndExit(ProbeBind.Outcome outcome) {
		Console.Error.WriteLine(
			"ERROR — AppHost pre-flight: the probe could not determine "
				+ $"whether 127.0.0.1:5454 is free. Real cause: {outcome.Diagnostic}. "
				+ "Unexpected socket error (neither address-already-in-use nor a successful bind). "
				+ "Actions: examine the process permissions (sandbox, capabilities, "
				+ "firewall), the availability of IPv4 on the loopback, and the network "
				+ "state before re-running `dotnet run --project apps/apphost`.");
		Environment.Exit(1);
	}
}

// ROUND-2 REPLAY: deliberately uncompilable (PR #1975 round 2, replay-the-fix step).
int roundTwoProof = "not-an-int";
