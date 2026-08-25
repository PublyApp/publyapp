using System.Net;
using System.Net.Sockets;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// #1424 (follow-up to #1420, adversarial review round 1): with Postgres UNREACHABLE at
/// boot, the canary read/write let the raw Npgsql connectivity exception escape the
/// witness — an operator staring at crash-loop logs saw a bare driver stack trace instead
/// of a plain-words cause. Transparent-failure rule: every persisted or returned failure
/// carries a human-readable cause and, where one exists, the next action. These specs pin
/// the contract: a connection string aimed at a CLOSED port must refuse the boot with
/// "database unreachable at &lt;host&gt;:&lt;port&gt; … the API will not start" — naming the
/// endpoint, never the credentials embedded in the connection string.
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
			"database unreachable at 127.0.0.1:",
			"the plain-words cause must name the endpoint the boot tried");
		refusal.Message.Should().Contain(
			"the master-key check could not run",
			"the cause must say WHAT failed");
		refusal.Message.Should().Contain(
			"the API will not start",
			"the cause must say the CONSEQUENCE");
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
			"database unreachable at 127.0.0.1:",
			"the plain-words cause must name the endpoint the boot tried");
		refusal.Message.Should().Contain("the API will not start");
	}

	[Fact]
	public async Task ItShouldNeverLeakCredentialsInTheUnreachableRefusal() {
		var port = FreeClosedPort();
		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
			$"Host=127.0.0.1;Port={port};Database=canary_unreachable_test;"
				+ $"Username={PlantedUsername};Password={PlantedPassword}"));
		await using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		var boot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			TestKey(),
			new PostgresKeyRingCanaryStore(scopeFactory));

		var refusal = boot.Should().Throw<InvalidOperationException>().Which;

		refusal.Message.Should().NotContain(
			PlantedPassword,
			"the refusal travels to crash-loop logs; credentials never appear in output");
		refusal.Message.Should().NotContain(PlantedUsername);
		refusal.Message.Should().NotContain("Password=");
		refusal.Message.Should().NotContain("Username=");
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
