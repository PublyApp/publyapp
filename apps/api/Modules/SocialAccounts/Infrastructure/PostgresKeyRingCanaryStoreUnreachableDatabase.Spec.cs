using System.Net;
using System.Net.Sockets;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// #1424, adversarial review round 2: the canary boot refusal must (a) tell the truth
/// about WHICH database infrastructure failure happened, and (b) never carry
/// credentials. Two genuinely different shapes exist, and the round-1 classifier
/// confused them — <see cref="PostgresException"/> DERIVES from
/// <see cref="NpgsqlException"/>, so a base-type-first match relabelled every
/// server-answered error (missing table 42P01, wrong password 28P01, CHECK violations)
/// as "database unreachable":
/// <list type="bullet">
/// <item>TRANSPORT: nothing answered (refused connection, timeout, broken connection)
/// — "cannot reach the database at &lt;host&gt;:&lt;port&gt; …".</item>
/// <item>SERVER ANSWERED, schema missing (SqlState 42P01/42703): the deploy-ordering
/// race — dokploy.yml starts api/worker/migrate concurrently and only the worker graph
/// waits for migrations — so the refusal must send the operator to the migrate task,
/// NOT to connectivity.</item>
/// <item>SERVER ANSWERED, anything else the boot translates (SQLSTATE class 08, …):
/// the refusal names the SqlState and the server's own message text.</item>
/// </list>
/// The credential spec below drives BOTH a transport failure and a server-delivered
/// 28P01 with a recognisable fake password: the 28P01 driver text quotes the USERNAME
/// verbatim, so only the store's redaction keeps the guarantee — against the pre-fix
/// classifier this spec provably fails (paired RED/GREEN logs in the PR description).
/// </summary>
public sealed class PostgresKeyRingCanaryStoreUnreachableDatabaseSpec {
	private const string PlantedUsername = "probe_user_1424";
	private const string PlantedPassword = "probe-password-1424-not-a-secret-marker";

	[Fact]
	public void ItShouldRefuseTheBootWithPlainWordsWhenTheCanaryReadCannotReachTheDatabase() {
		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
			$"Host=127.0.0.1;Port={FreeClosedPort()};Database=canary_unreachable_test;"
				+ $"Username={PlantedUsername};Password={PlantedPassword}"));
		using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		var boot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			TestKey(),
			new PostgresKeyRingCanaryStore(scopeFactory));

		var refusal = boot.Should().Throw<InvalidOperationException>(
			"a canary read against an unreachable database must refuse the boot, never "
				+ "escape as a raw Npgsql driver exception").Which;

		refusal.Message.Should().StartWith(
			PostgresKeyRingCanaryStore.UnreachablePrefix + "127.0.0.1:",
			"the plain-words cause must name the endpoint the boot tried");
		refusal.Message.Should().Contain(
			"the master-key check could not run",
			"the cause must say WHAT failed");
		refusal.Message.Should().Contain(
			"the API will not start",
			"the cause must say the CONSEQUENCE");
		refusal.Message.Should().Contain(
			"running and reachable",
			"for a TRANSPORT failure the right operator action is the reachability check");
	}

	[Fact]
	public void ItShouldRefuseTheBootWithPlainWordsWhenTheCanaryWriteCannotReachTheDatabase() {
		// Write-side complement: the read is short-circuited (stale empty view, the
		// mint-race shape) so the boot proceeds to MINT, and SaveChanges hits the
		// unreachable database — the DbUpdateException wrapping the Npgsql connectivity
		// failure must land in the same plain-words refusal.
		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
			$"Host=127.0.0.1;Port={FreeClosedPort()};Database=canary_unreachable_test;"
				+ $"Username={PlantedUsername};Password={PlantedPassword}"));
		using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		var boot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			TestKey(),
			new FrozenEmptyCanaryStore(new PostgresKeyRingCanaryStore(scopeFactory)));

		var refusal = boot.Should().Throw<InvalidOperationException>(
			"a canary mint (blind insert) against an unreachable database must refuse the "
				+ "boot with the same plain-words cause").Which;

		refusal.Message.Should().StartWith(
			PostgresKeyRingCanaryStore.UnreachablePrefix + "127.0.0.1:",
			"the plain-words cause must name the endpoint the boot tried");
		refusal.Message.Should().Contain("the API will not start");
	}

	[Fact]
	public async Task ItShouldNeverLeakCredentialsInTheRefusalWhenTheTransportFailsOrTheServerAnswers() {
		// Round-1 review: the old credential spec drove ONLY the closed-port case, where
		// the driver never got far enough to echo anything — it passed BEFORE the fix
		// existed and proved nothing. This rewrite drives BOTH shapes against connection
		// strings carrying the planted markers:
		//   1. transport failure (closed port) — the driver text is its own;
		//   2. a REACHABLE server answering 28P01 for the planted user — the driver text
		//      quotes the username VERBATIM unless the refusal redacts it.
		var containerFixture = await PostgresContainerFixture.GetSharedAsync();
		var dbName = $"canaryleak_{Guid.NewGuid():N}";
		await CreateDatabaseAsync(containerFixture.AdminConnectionString, dbName);

		try {
			var transportShape = $"Host=127.0.0.1;Port={FreeClosedPort()};Database={dbName};"
				+ $"Username={PlantedUsername};Password={PlantedPassword};Pooling=false";
			var serverAnsweredShape = new NpgsqlConnectionStringBuilder(
				containerFixture.AdminConnectionString) {
				Database = dbName,
				Username = PlantedUsername,
				Password = PlantedPassword,
				Pooling = false
			}.ConnectionString;

			var shapes = new[] {
				new {
					Kind = "transport failure (connection refused)",
					ConnectionString = transportShape
				},
				new {
					Kind = "server-delivered 28P01 (wrong password)",
					ConnectionString = serverAnsweredShape
				}
			};

			foreach (var shape in shapes) {
				var services = new ServiceCollection();
				services.AddDbContext<AppDbContext>(options =>
					options.UseNpgsql(shape.ConnectionString));
				using var provider = services.BuildServiceProvider();
				var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

				var boot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
					TestKey(),
					new PostgresKeyRingCanaryStore(scopeFactory));

				var refusal = boot.Should().Throw<InvalidOperationException>(
					"the " + shape.Kind + " must refuse the boot, never escape as a raw "
						+ "driver exception").Which;

				refusal.Message.Should().NotContain(
					PlantedPassword,
					"the refusal travels to crash-loop logs; the planted password marker "
						+ "must never surface in any shape (" + shape.Kind + ")");
				refusal.Message.Should().NotContain(
					PlantedUsername,
					"a server that answers quotes the connection-string username in its "
						+ "error text; the refusal must redact it (" + shape.Kind + ")");
				refusal.Message.Should().NotContain("Password=")
					.And.NotContain("Username=");
				WholeChainText(refusal).Should().NotContain(
					PlantedPassword,
					"crash-loop logs print the whole exception chain, so the password "
						+ "marker must be absent from EVERY link (" + shape.Kind + ")");
			}
		} finally {
			NpgsqlConnection.ClearAllPools();
			await DropDatabaseAsync(containerFixture.AdminConnectionString, dbName);
		}
	}

	[Fact]
	public async Task ItShouldSendTheOperatorToTheMigratorNotToConnectivityWhenTheServerAnswersWithoutTheCanaryTable() {
		// The production-reachable deploy-ordering shape (round-1 review, MAJOR): a
		// database that ANSWERS but has no data_protection_keys yet, because dokploy.yml
		// starts api/worker/migrate concurrently and only the worker graph waits for
		// pending migrations. Relabelling this as "unreachable" orders the operator to
		// verify reachability of a database that demonstrably answers.
		var containerFixture = await PostgresContainerFixture.GetSharedAsync();
		var dbName = $"canary42p01_{Guid.NewGuid():N}";
		await CreateDatabaseAsync(containerFixture.AdminConnectionString, dbName);

		try {
			var connectionString = new NpgsqlConnectionStringBuilder(
				containerFixture.AdminConnectionString) {
				Database = dbName,
				Pooling = false
			}.ConnectionString;
			var services = new ServiceCollection();
			services.AddDbContext<AppDbContext>(options =>
				options.UseNpgsql(connectionString));
			using var provider = services.BuildServiceProvider();
			var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

			var boot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
				TestKey(),
				new PostgresKeyRingCanaryStore(scopeFactory));

			var refusal = boot.Should().Throw<InvalidOperationException>(
				"a reachable but unmigrated database must refuse with its own cause, not "
					+ "an unreachable claim").Which;

			refusal.Message.Should().Contain(
				"migrations have not been applied yet",
				"SqlState 42P01 on the canary table means the SCHEMA is missing — the "
					+ "operator action is to wait for/run the migrations");
			refusal.Message.Should().Contain(
				"42P01",
				"the SqlState pins exactly which schema object was missing");
			refusal.Message.Should().NotContain(
				"unreachable",
				"the server answered, so the database is by definition reachable; sending "
					+ "operators to check connectivity wastes the incident");
			refusal.Message.Should().Contain("the API will not start");
		} finally {
			NpgsqlConnection.ClearAllPools();
			await DropDatabaseAsync(containerFixture.AdminConnectionString, dbName);
		}
	}

	// ---- helpers ----

	/// <summary>
	/// Grabs a loopback port and releases it immediately: connecting there is refused
	/// (RST), which is deterministic and needs no running Postgres at all.
	/// </summary>
	private static int FreeClosedPort() {
		var listener = new TcpListener(IPAddress.Loopback, 0);
		listener.Start();
		try {
			return ((IPEndPoint)listener.LocalEndpoint).Port;
		} finally {
			listener.Stop();
		}
	}

	private static byte[] TestKey() {
		// Random test-only 32-byte key (never a secret): passes size + entropy gates so
		// the boot reaches the canary read/write, which is what these specs exercise.
		var key = new byte[32];
		System.Security.Cryptography.RandomNumberGenerator.Fill(key);
		return key;
	}

	/// <summary>
	/// Every message the crash-loop log would print for this exception: the refusal plus
	/// each link of its InnerException chain (including the Postgres-specific
	/// MessageText).
	/// </summary>
	private static string WholeChainText(Exception ex) {
		var text = string.Empty;
		for (var current = (Exception?)ex; current is not null; current = current.InnerException) {
			text += "\n" + current.Message;
			if (current is PostgresException pg) {
				text += "\n" + pg.MessageText;
			}
		}

		return text;
	}

	private static async Task CreateDatabaseAsync(string adminConnectionString, string dbName) {
		await using var adminConn = new NpgsqlConnection(adminConnectionString);
		await adminConn.OpenAsync();
		await using var createCmd = new NpgsqlCommand($"CREATE DATABASE {dbName}", adminConn);
		await createCmd.ExecuteNonQueryAsync();
	}

	private static async Task DropDatabaseAsync(string adminConnectionString, string dbName) {
		await using var adminConn = new NpgsqlConnection(adminConnectionString);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {dbName}", adminConn);
		await dropCmd.ExecuteNonQueryAsync();
	}

	/// <summary>
	/// Reports the canary as MISSING on the first read without touching the database,
	/// replaying the stale-empty view that sends a first boot into the mint/write path.
	/// </summary>
	private sealed class FrozenEmptyCanaryStore : IKeyRingCanaryStore {
		private readonly IKeyRingCanaryStore _inner;
		private bool _emptinessReported;

		public FrozenEmptyCanaryStore(IKeyRingCanaryStore inner) {
			_inner = inner;
		}

		public string? Read() {
			if (_emptinessReported) {
				return _inner.Read();
			}

			_emptinessReported = true;
			return null;
		}

		public void Write(string blob) {
			_inner.Write(blob);
		}
	}
}
