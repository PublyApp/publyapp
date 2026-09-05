using FluentAssertions;

using Microsoft.Extensions.Diagnostics.HealthChecks;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

public sealed class HealthCheckLogGateSpec {
	[Fact]
	public void ItShouldLogFailuresOnTransitionAndPeriodicSampleOnly() {
		var gate = new HealthCheckLogGate();
		var start = DateTimeOffset.UtcNow;

		gate.ShouldLog(
			"database_migrations", HealthStatus.Unhealthy, failureReason: null, start
		).Should().BeTrue();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			failureReason: null,
			start.AddSeconds(1)
		).Should().BeFalse();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			failureReason: null,
			start.AddMinutes(1)
		).Should().BeTrue();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Healthy,
			failureReason: null,
			start.AddMinutes(1)
		).Should().BeTrue();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Healthy,
			failureReason: null,
			start.AddMinutes(1).AddSeconds(1)
		).Should().BeFalse();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			failureReason: null,
			start.AddMinutes(1).AddSeconds(2)
		).Should().BeTrue();
	}

	[Fact]
	public void ItShouldLogWhenAnUnhealthyFailureReasonChanges() {
		var gate = new HealthCheckLogGate();
		var start = DateTimeOffset.UtcNow;

		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			"pending_migrations",
			start
		).Should().BeTrue();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			"pending_migrations",
			start.AddSeconds(1)
		).Should().BeFalse();
		gate.ShouldLog(
			"database_migrations",
			HealthStatus.Unhealthy,
			"database_unreachable",
			start.AddSeconds(2)
		).Should().BeTrue();
	}
}
