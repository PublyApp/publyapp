using FluentAssertions;

using Npgsql;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Tests.Fixtures;

public sealed class TestDatabaseReuseSpec {
	private const string _Name = "unit-test-database-container";

	[Fact]
	public async Task ItShouldResumeTheWinnersContainerWhenTheRunRaceIsLost() {
		// Reproduces the concurrent cold start: `docker run` loses the name
		// race, and `docker inspect` cannot see the winner for a moment.
		var docker = new FakeDocker {
			InspectResponses = [
				(1, "", "Error: No such object"),
				(1, "", "Error: No such object"),
				(0, "false|1", ""),
			],
			RunResponse = (
				125,
				"",
				"Conflict. The container name is already in use"
			),
		};

		var act = () => TestDatabaseReuse.EnsureContainerAsync(
			TestDatabaseReuseSpec._Name,
			CancellationToken.None,
			docker.RunAsync,
			TimeSpan.FromSeconds(5)
		);

		await act.Should().NotThrowAsync();
		docker.Verbs.Should().ContainInOrder(
			"inspect",
			"run",
			"inspect",
			"inspect",
			"start"
		);
	}

	[Fact]
	public async Task ItShouldFailWithTheOriginalConflictWhenTheWinnerNeverAppears() {
		var docker = new FakeDocker {
			InspectResponses = [
				(1, "", "Error: No such object"),
				(1, "", "Error: No such object"),
			],
			RunResponse = (
				125,
				"",
				"Conflict. The container name is already in use"
			),
		};

		var act = () => TestDatabaseReuse.EnsureContainerAsync(
			TestDatabaseReuseSpec._Name,
			CancellationToken.None,
			docker.RunAsync,
			TimeSpan.FromMilliseconds(50)
		);

		await act.Should()
			.ThrowAsync<InvalidOperationException>()
			.WithMessage("*already in use*");
	}

	[Fact]
	public async Task ItShouldFailImmediatelyWhenTheRunFailsForAnotherReason() {
		var docker = new FakeDocker {
			InspectResponses = [(1, "", "Error: No such object")],
			RunResponse = (
				125,
				"",
				"Cannot connect to the Docker daemon"
			),
		};

		var act = () => TestDatabaseReuse.EnsureContainerAsync(
			TestDatabaseReuseSpec._Name,
			CancellationToken.None,
			docker.RunAsync,
			TimeSpan.FromSeconds(5)
		);

		await act.Should()
			.ThrowAsync<InvalidOperationException>()
			.WithMessage("*Cannot connect to the Docker daemon*");
		docker.Verbs.Should().Equal("inspect", "run");
	}

	[Fact]
	public void ItShouldKeepTheShortConnectTimeoutOnlyOnTheReadinessProbe() {
		var admin = TestDatabaseReuse.BuildAdminConnectionString(5432);
		var probe = TestDatabaseReuse.BuildProbeConnectionString(admin);
		var adminBuilder = new NpgsqlConnectionStringBuilder(admin);
		var probeBuilder = new NpgsqlConnectionStringBuilder(probe);

		// The admin string reaches the app's UseNpgsql through every per-test
		// connection string, so it must keep Npgsql's 15 s default.
		adminBuilder.Timeout.Should().Be(15);
		probeBuilder.Timeout.Should().Be(2);
		probeBuilder.Database.Should().Be(adminBuilder.Database);
		probeBuilder.Port.Should().Be(adminBuilder.Port);
	}

	private sealed class FakeDocker {
		private int _InspectIndex;

		public List<string> Verbs { get; } = [];

		public (int ExitCode, string Stdout, string Stderr)[] InspectResponses {
			get;
			set;
		} = [];

		public (int ExitCode, string Stdout, string Stderr) RunResponse {
			get;
			set;
		}

		public Task<(int ExitCode, string Stdout, string Stderr)> RunAsync(
			IReadOnlyList<string> arguments,
			CancellationToken ct
		) {
			_ = ct;
			var verb = arguments[0];
			this.Verbs.Add(verb);
			return verb switch {
				"inspect" => Task.FromResult(this.InspectResponses[
					Math.Min(
						this._InspectIndex++,
						this.InspectResponses.Length - 1
					)
				]),
				"run" => Task.FromResult(this.RunResponse),
				"start" => Task.FromResult((0, "", "")),
				_ => throw new InvalidOperationException(
					$"Unexpected docker command '{verb}'."
				),
			};
		}
	}
}
