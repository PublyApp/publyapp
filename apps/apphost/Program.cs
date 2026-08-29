// Issue #255 spike: LOCAL DEV ORCHESTRATION ONLY. `dotnet run --project apps/apphost`
// starts a persistent Postgres (port 5454, data volume), the API (APP_ROLE=api),
// the worker (APP_ROLE=worker) and the front dev server, plus the Aspire dashboard
// (traces/metrics via OTel).
// Production (dokploy.yml) and e2e (docker-compose.test.yml) are deliberately untouched.
using System.Net;
using System.Net.Sockets;

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
{
	var port = 5454;
	var probe = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
	bool occupied;
	try {
		probe.Bind(new IPEndPoint(IPAddress.Loopback, port));
		occupied = false;
	} catch (SocketException) {
		occupied = true;
	} finally {
		probe.Dispose();
	}

	if (occupied) {
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

builder.Build().Run();
