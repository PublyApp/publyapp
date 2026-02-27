namespace MainApi.Src.Lib.Testing.Fixtures {
	/// <summary>
	/// Sets process-wide environment variables for the test run.
	/// Must be called once before AppEnvironment.Initialize().
	///
	/// Strategy:
	///   1. Set ASPNETCORE_ENVIRONMENT=Testing (prevents
	///      AppEnvironment from loading .env.development itself)
	///   2. Load .env.development via DotNetEnv (provides all
	///      default config values — app name, headers, token
	///      lengths, etc.)
	///   3. Override only the vars that differ from development:
	///      - POSTGRES_CONNECTION_STRING (Testcontainer)
	///      - FRONT_URL (no port)
	///      - RESEND_API_KEY (fake)
	///      - STAFF_OWNER_EMAIL (test value)
	///      - STAFF_OWNER_BOOTSTRAP_CODE (test value)
	///   4. Call AppEnvironment.Initialize()
	///
	/// Uses CompareExchange for thread-safe one-time init with
	/// rollback on failure.
	/// </summary>
	internal static class TestEnvironment {
		private static int _isInitialized;

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

				// 4. Initialize AppEnvironment singleton BEFORE any
				//    MainApiDbContext is created (OnModelCreating
				//    accesses AppEnvironment.Instance).
				_ = AppEnvironment.Initialize();
			} catch {
				Volatile.Write(ref _isInitialized, 0);
				throw;
			}
		}
	}
}
