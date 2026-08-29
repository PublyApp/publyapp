// Issue #255 spike: LOCAL DEV ORCHESTRATION ONLY. `dotnet run --project apps/apphost`
// starts a persistent Postgres (port 5454, data volume), the API (APP_ROLE=api),
// the worker (APP_ROLE=worker) and the front dev server, plus the Aspire dashboard
// (traces/metrics via OTel).
// Production (dokploy.yml) and e2e (docker-compose.test.yml) are deliberately untouched.
var builder = DistributedApplication.CreateBuilder(args);

// Persistent local Postgres on the host's stable :5454 with a named data volume —
// survives AppHost restarts and replaces the former local compose Postgres.
var postgresPassword = builder.AddParameter("postgres-password", "password", secret: true);
var postgres = builder.AddPostgres("postgres").WithPassword(postgresPassword).WithHostPort(5454).WithDataVolume();
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
