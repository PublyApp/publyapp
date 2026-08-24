using Npgsql;

namespace PublyApp.Api.Lib.Testing.Fixtures;

/// <summary>
/// Per-test template-cloned Postgres database for the witness boot integration specs
/// (#1309): the child process boots the REAL Program.Main against it, so the canary row is
/// genuinely minted/verified through PostgresKeyRingCanaryStore on the data_protection_keys
/// table created by the SocialAccountsModule migration baked into the template DB.
/// Dropped on dispose.
/// <para>
/// Lives under Lib/Testing so it compiles ONLY into the test project (the API csproj
/// excludes Lib/Testing/**); the shipped artifact stays untouched.
/// </para>
/// </summary>
public sealed class WitnessTestDatabase : IAsyncDisposable {
	private const string DbName = "witness_boot_canary_test";

	private readonly string _adminConnectionString;

	private WitnessTestDatabase(string adminConnectionString) {
		_adminConnectionString = adminConnectionString;
	}

	public string ConnectionString { get; private set; } = "";

	public static async Task<WitnessTestDatabase> CreateAsync() {
		var container = await PostgresContainerFixture.GetSharedAsync();
		var manager = new DatabaseTemplateManager(
			container.AdminConnectionString,
			container.TemplateDbName
		);

		// A previous failed run can leave the clone behind; start from a clean slate so
		// each test exercises a FIRST boot (the witness mints the canary row itself).
		await manager.DropDatabaseAsync(DbName);

		return new WitnessTestDatabase(container.AdminConnectionString) {
			ConnectionString = await manager.CreateDatabaseFromTemplateAsync(DbName),
		};
	}

	public async ValueTask DisposeAsync() {
		try {
			var manager = new DatabaseTemplateManager(_adminConnectionString, "postgres");
			await manager.DropDatabaseAsync(DbName);
		} catch (PostgresException) {
			// Best-effort cleanup; the shared container outlives the run either way.
		}
	}
}
