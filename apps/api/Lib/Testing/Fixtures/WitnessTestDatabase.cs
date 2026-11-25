using Npgsql;

namespace PublyApp.Api.Lib.Testing.Fixtures;

/// <summary>
/// Per-test template-cloned Postgres database for the witness boot integration specs
/// (#1309): the child process boots the REAL Program.Main against it, so the canary row is
/// genuinely minted/verified through PostgresKeyRingCanaryAdapter on the data_protection_keys
/// table created by the SocialAccountsModule migration baked into the template DB.
/// Dropped on dispose.
/// <para>
/// Lives under Lib/Testing so it compiles ONLY into the test project (the API csproj
/// excludes Lib/Testing/**); the shipped artifact stays untouched.
/// </para>
/// </summary>
public sealed class WitnessTestDatabase : IAsyncDisposable {
	private readonly string _DbName;
	private readonly string _AdminConnectionString;

	private WitnessTestDatabase(
		string adminConnectionString,
		string dbName
	) {
		this._AdminConnectionString = adminConnectionString;
		this._DbName = dbName;
	}

	public string ConnectionString { get; private set; } = "";

	public static async Task<WitnessTestDatabase> CreateAsync() {
		var container = await PostgresContainerFixture.GetSharedAsync();
		var manager = new DatabaseTemplateManager(
			container.AdminConnectionString,
			container.TemplateDbName
		);

		// Unique per instance: a reused Postgres container is shared by every
		// test process, and a fixed name would let concurrent witness specs
		// drop each other's database. A previous failed run can leave a clone
		// behind; drop it so each test exercises a FIRST boot (the witness
		// mints the canary row itself).
		var dbName = $"witness_boot_canary_test_{Guid.NewGuid():N}";
		await manager.DropDatabaseAsync(dbName);

		return new WitnessTestDatabase(
			container.AdminConnectionString,
			dbName
		) {
			ConnectionString =
				await manager.CreateDatabaseFromTemplateAsync(dbName),
		};
	}

	public async ValueTask DisposeAsync() {
		try {
			var manager = new DatabaseTemplateManager(this._AdminConnectionString, "postgres");
			await manager.DropDatabaseAsync(this._DbName);
		} catch (PostgresException) {
			// Best-effort cleanup; the shared container outlives the run either way.
		}
	}
}
