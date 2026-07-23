namespace PublyApp.Api.Lib.Testing.Fixtures {
	/// <summary>
	/// Sets process-wide environment variables for the test run.
	/// Must be called once before AppEnvironment.Initialize().
	///
	/// Strategy:
	///   1. Set ASPNETCORE_ENVIRONMENT=Testing (prevents
	///      AppEnvironment from loading .env.development itself)
	///      and pin APP_ROLE=all (2B/G9: belt-and-suspenders — Testing
	///      already defaults an unset APP_ROLE to All, but the test
	///      bootstrap pins it explicitly so the role is never implicit)
	///   2. Load .env.development via DotNetEnv (provides all
	///      default config values — app name, headers, token
	///      lengths, etc.)
	///   3. Override only the vars that differ from development:
	///      - POSTGRES_CONNECTION_STRING (Testcontainer, or the
	///        deterministic placeholder used by Bootstrap() below)
	///      - FRONT_URL (no port)
	///      - RESEND_API_KEY (fake)
	///      - STAFF_OWNER_EMAIL (test value)
	///      - STAFF_OWNER_BOOTSTRAP_CODE (test value)
	///   4. Call AppEnvironment.Initialize()
	///
	/// Uses CompareExchange for thread-safe one-time init with
	/// rollback on failure.
	///
	/// Determinism under xUnit parallel scheduling (2B round-5 fix, G9):
	/// InitializeOnce() used to run for the first time whenever some
	/// IClassFixture&lt;ApiFixture&gt;-backed class happened to start the
	/// shared Postgres fixture (via PostgresContainerFixture.InitializeAsync()).
	/// But several architecture specs (e.g. HandlerScopeNamingGuardSpec) call
	/// AppEnvironment.Initialize() directly from a static constructor, with no
	/// fixture at all. Under xUnit's parallel class scheduling, if one of
	/// those classes was scheduled before any fixture-backed class, it raced
	/// AppEnvironment.Initialize() (idempotent, first-caller-wins) against an
	/// unset host environment: GetHostEnvironmentName() fell back to
	/// "Production", where G9 requires APP_ROLE and fails fast — "APP_ROLE is
	/// not set" — even though this is a test run. Bootstrap() below closes
	/// that race by construction rather than by hoping a fixture wins: the
	/// CLR runs a [ModuleInitializer] once, when the test assembly
	/// (PublyApp.Api.Tests.dll) is loaded — before any other code in that
	/// module executes, including the static constructor of the very first
	/// test class xUnit touches (ECMA-335 module-initializer semantics; see
	/// Bootstrap()'s own doc comment). So InitializeOnce() always wins the
	/// race now, deterministically, regardless of xUnit's schedule.
	/// </summary>
	internal static class TestEnvironment {
		private static int _isInitialized;

		/// <summary>
		/// Deterministic placeholder used ONLY by Bootstrap()'s eager,
		/// module-load-time call to InitializeOnce() — the real Testcontainers
		/// Postgres container doesn't exist yet at that point (it starts async,
		/// later, from PostgresContainerFixture.InitializeAsync()). This is safe
		/// because AppEnvironment.Instance.POSTGRES_CONNECTION_STRING is never
		/// used for actual per-test database access: ApiFactory always
		/// overrides the DbContext with the real per-test-class connection
		/// string (see ApiFactory's own doc comment — "Any code that reads
		/// POSTGRES_CONNECTION_STRING directly will NOT see the test DB").
		/// The placeholder only needs to satisfy
		/// AppEnvironmentValidator.BeValidPostgresConnectionString (a
		/// well-formed Host/Database/Username/Password), never to connect.
		/// </summary>
		private const string PlaceholderConnectionString =
			"Host=localhost;Database=publyapp_bootstrap_placeholder;"
			+ "Username=postgres;Password=postgres";

		/// <summary>
		/// Module initializer — the mechanism that makes the G9 (APP_ROLE
		/// required) test bootstrap deterministic (2B round-5).
		///
		/// The C#/ECMA-335 module-initializer guarantee: a method marked
		/// [ModuleInitializer] runs exactly once, at module-load time, before
		/// ANY other code in that module runs — including the type
		/// initializer (static constructor) of the first type any caller
		/// touches. `Lib/Testing/**` and every `*.Spec.cs` file across
		/// apps/api are excluded from the main API project (PublyApp.Api.csproj)
		/// and compiled ONLY into the Tests project
		/// (Tests/PublyApp.Api.Tests.csproj — see its Compile Include globs),
		/// so this method and every test/architecture-spec class share exactly
		/// one module: PublyApp.Api.Tests.dll. That means this is guaranteed
		/// to run before xUnit can load/schedule/execute any test class in
		/// that assembly, parallel or not — not merely "usually first", but
		/// enforced by the CLR loader itself, independent of xUnit's
		/// scheduling order.
		///
		/// Bootstrap() therefore folds into the existing InitializeOnce()
		/// path (no second init mechanism): whichever caller reaches
		/// AppEnvironment.Initialize() next — a fixture-backed class via
		/// PostgresContainerFixture.InitializeAsync(), or an architecture
		/// spec's own static constructor — finds InitializeOnce() already
		/// run and Instance already set, so it's a no-op return. See
		/// PlaceholderConnectionString's doc comment for why the eager
		/// placeholder is safe.
		/// </summary>
		[System.Runtime.CompilerServices.ModuleInitializer]
		internal static void Bootstrap() {
			InitializeOnce(PlaceholderConnectionString);
		}

		public static void InitializeOnce(
			string postgresConnectionString
		) {
			if (Interlocked.CompareExchange(
				ref _isInitialized, 1, 0
			) != 0) {
				return;
			}

			try {
				// 1. Prevent AppEnvironment.LoadDotEnvIfDevelopment()
				//    from loading .env.development a second time
				Environment.SetEnvironmentVariable(
					"ASPNETCORE_ENVIRONMENT",
					EnvironmentNames.Testing
				);

				// 1b. Pin a deterministic test APP_ROLE (2B/G9). Testing
				//     already defaults an unset APP_ROLE to AppRole.All (see
				//     AppEnvironment.GetOptionalAppRole), so this is
				//     belt-and-suspenders determinism, not a behavior change:
				//     it makes the test role explicit rather than relying on
				//     the environment-gated default, mirroring the `just
				//     test-api` recipes' own APP_ROLE export (justfile).
				Environment.SetEnvironmentVariable(
					"APP_ROLE",
					"all"
				);

				// 2. Load .env.development as baseline config.
				//    This provides ~12 settings (APP_NAME, headers,
				//    token lengths, etc.) so we don't duplicate them.
				string? dotEnvPath = AppEnvironment.FindDotEnvPath(
					".env.development"
				);
				if (dotEnvPath is null) {
					throw new InvalidOperationException(
						"Could not find .env.development file. "
						+ "Integration tests require this file "
						+ "for baseline configuration."
					);
				}
				_ = DotNetEnv.Env.Load(dotEnvPath);

				// 3. Override only the vars that differ from dev
				Environment.SetEnvironmentVariable(
					"POSTGRES_CONNECTION_STRING",
					postgresConnectionString
				);
				Environment.SetEnvironmentVariable(
					"FRONT_URL",
					"http://localhost"
				);
				Environment.SetEnvironmentVariable(
					"RESEND_API_KEY",
					"test"
				);
				Environment.SetEnvironmentVariable(
					"STAFF_OWNER_EMAIL",
					"owner@example.com"
				);
				Environment.SetEnvironmentVariable(
					"STAFF_OWNER_BOOTSTRAP_CODE",
					"test-bootstrap-code"
				);
				// Large integration-spec classes share one API host and
				// legitimately log in more often than production limits
				// allow. Keep their setup traffic isolated from rate-limit
				// state; AnonymousAuthRateLimitingSpec replaces these
				// settings with deliberately small limits.
				Environment.SetEnvironmentVariable(
					"ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT",
					"10000"
				);
				Environment.SetEnvironmentVariable(
					"ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT",
					"10000"
				);
				Environment.SetEnvironmentVariable(
					"PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT",
					"10000"
				);
				var highRateLimitPermitVariables = new[] {
					"GLOBAL_RATE_LIMIT_PERMIT_LIMIT",
					"ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT",
					"AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT",
					"HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT",
					"BULK_RATE_LIMIT_PERMIT_LIMIT",
					"TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT",
					"EMAIL_RATE_LIMIT_PERMIT_LIMIT",
					"TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT",
					"EXPORT_RATE_LIMIT_PERMIT_LIMIT",
					"TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT",
					"UPLOAD_RATE_LIMIT_PERMIT_LIMIT",
				};
				foreach (
					var variable in highRateLimitPermitVariables
				) {
					Environment.SetEnvironmentVariable(
						variable,
						"10000"
					);
				}

				// 4. Initialize AppEnvironment singleton BEFORE any
				//    AppDbContext is created (OnModelCreating
				//    accesses AppEnvironment.Instance).
				_ = AppEnvironment.Initialize();
			} catch {
				Volatile.Write(ref _isInitialized, 0);
				throw;
			}
		}
	}
}
