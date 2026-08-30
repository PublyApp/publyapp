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
		"ERREUR — une valeur de configuration locale remplace le mot de passe "
			+ "local de développement de l'AppHost (Parameters:postgres-password = "
				+ $"{configuredPassword.Length} caractères, la valeur attendue est le littéral "
					+ "`password`). La pile locale (.env.example, .env.development et les recettes "
						+ "db-* du justfile) est câblée sur Password=password : avec une valeur "
							+ "différente, just db-migrate et toute connection string seraient "
								+ "en désaccord silencieux avec le conteneur. "
		+ "Actions : supprimez la valeur générée du magasin de secrets de l'AppHost "
			+ "(dotnet user-secrets --id publyapp-apphost-255-spike remove "
				+ "\"Parameters:postgres-password\", fichier ~/.microsoft/usersecrets/"
					+ "publyapp-apphost-255-spike/secrets.json), retirez la variable d'environnement "
						+ "Parameters__postgres-password si elle est posée, puis relancez "
							+ "`dotnet run --project apps/apphost` — ou, si vous voulez vraiment un "
								+ "autre mot de passe, changez la constante dans .env.example, "
									+ ".env.development et les recettes db-* du justfile en même temps.");
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
	try {
		probe.Bind(new IPEndPoint(IPAddress.Loopback, 5454));
		return true;
	} catch (SocketException) {
		return false;
	} finally {
		probe.Dispose();
	}
}

void FailLoudlyOnOccupiedPort() {
	Console.Error.WriteLine(
		"ERREUR — le port hôte 5454 est déjà occupé : le mandataire DCP de l'AppHost "
			+ "n'arriverait pas à y lier Postgres (bind: address already in use), et la "
			+ "pile continuerait silencieusement sur un port aléatoire, pendant que "
			+ "POSTGRES_CONNECTION_STRING annonce toujours Host=localhost;Port=5454. "
			+ "L'API et le worker se connecteraient alors à la BASE QUI OCCUPE "
			+ "5454 — probablement le Postgres local d'un autre projet — et "
			+ "écriraient dedans sans crier.\n"
		+ "Actions : arrêtez le processus/conteneur qui écoute sur 5454 (ex. le conteneur "
			+ "residuaire `publyapp-postgres` : docker rm -f publyapp-postgres ; vérification : "
			+ "`ss -tlnp | grep 5454`), puis relancez `dotnet run --project apps/apphost` — "
			+ "ou, pour un port différent, changez le 5454 de cet AppHost ET de "
			+ "POSTGRES_CONNECTION_STRING dans .env.development ET des recettes "
			+ "db-* du justfile, car tout est câblé sur 5454.");
	Environment.Exit(1);
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
//                            --plain-bind-preflight flag the probe drops
//                            SO_REUSEADDR (raw libc bind — the only faithful
//                            "plain" variant, .NET's managed bind sets reuse
//                            by default) so the guard can reproduce the
//                            round-4 kernel hazard: a plain bind against the
//                            closing residue exits 1 with errno 98.
if (args.Contains("--dump-model")) {
	DumpModelClaims();
	return;
}

if (args.Contains("--hold-port-5454")) {
	try {
		HoldPort5454Forever();
	} catch (SocketException ex) {
		Console.Error.WriteLine(
			"ERREUR — hold-port-5454 : impossible de binder 127.0.0.1:5454 "
				+ $"(un écouteur actif l'occupe probablement ; {ex.Message}). "
				+ "Libérez le port puis relancez le test.");
		Environment.Exit(1);
	}
}

if (!HostPort5454IsFree()) {
	FailLoudlyOnOccupiedPort();
}

if (args.Contains("--preflight-only")) {
	var plainBind = args.Contains("--plain-bind-preflight");
	if (!HostPort5454IsFree(plainBind)) {
		FailLoudlyOnOccupiedPort();
	}
	Console.WriteLine("host port 5454 preflight: free");
	return;
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
