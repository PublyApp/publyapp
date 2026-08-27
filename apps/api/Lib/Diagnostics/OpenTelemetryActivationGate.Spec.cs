using FluentAssertions;

using Microsoft.Extensions.Hosting;

using Xunit;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Issue #1607: the OpenTelemetry activation gate must be GUARDED BY A TEST, not merely
/// by code reading. <c>ConfigureOpenTelemetry()</c> attaches the SDK only when
/// <c>OTEL_EXPORTER_OTLP_ENDPOINT</c> is present; without that early return, every boot
/// (tests, doc-gen, production) would register OpenTelemetry providers. The original
/// guarantee — "without this variable, no OpenTelemetry component is registered" — rested
/// on reading the code; this spec makes it load-bearing by observing the EFFECT.
///
/// It does NOT assert "the variable is absent, therefore nothing starts" (that proves
/// nothing). It measures the real artifact: the post-configuration service collection.
/// <c>AddOpenTelemetry()</c> registers provider types under the <c>OpenTelemetry.*</c>
/// namespaces; if the gate is broken, those descriptors appear in
/// <c>builder.Services</c> even with the variable absent, and the assertion fails.
///
/// Non-vacuity (the paired proof in <c>.dump/preuve-1607.md</c>): removing the early
/// return in <c>OpenTelemetryConfigExtensions.ConfigureOpenTelemetry</c> must turn this
/// spec RED, because the registration then runs and the <c>OpenTelemetry.*</c> descriptors
/// show up in the collection. Restoring the gate returns it to GREEN.
/// </summary>
public sealed class OpenTelemetryActivationGateSpec {
	// The single activation switch the Aspire AppHost injects. Presence — not value —
	// is the gate (see OpenTelemetryConfigExtensions remarks).
	private const string OtlpEndpointVariableName = "OTEL_EXPORTER_OTLP_ENDPOINT";

	[Fact]
	public void ItShouldRegisterNoOpenTelemetryComponentsWhenTheOtlpEndpointVariableIsAbsent() {
		// The gate keys on the variable's PRESENCE. Pin it absent so the measurement is
		// deterministic regardless of the surrounding shell/CI environment, then restore it.
		var previous = Environment.GetEnvironmentVariable(OtlpEndpointVariableName);
		Environment.SetEnvironmentVariable(OtlpEndpointVariableName, null);
		try {
			// A bare host builder — no logger, no web server — so the only
			// OpenTelemetry.* descriptors in the collection can originate from the
			// extension under test, never from surrounding composition.
			var builder = Host.CreateApplicationBuilder();
			builder.ConfigureOpenTelemetry();

			// Measure the ACTUAL artifact, not a proxy: the post-configuration service
			// collection. Either the ServiceType or the ImplementationType carrying an
			// OpenTelemetry.* namespace is sufficient evidence that the SDK was attached.
			var registeredOtelComponents = builder.Services
				.Where(descriptor =>
					(descriptor.ServiceType?.FullName?
						.StartsWith("OpenTelemetry.", StringComparison.Ordinal) ?? false)
					|| (descriptor.ImplementationType?.FullName?
						.StartsWith("OpenTelemetry.", StringComparison.Ordinal) ?? false))
				.ToList();

			registeredOtelComponents.Should().BeEmpty(
				because: "without OTEL_EXPORTER_OTLP_ENDPOINT, ConfigureOpenTelemetry() must attach " +
				"nothing, so the post-configuration service collection carries no OpenTelemetry " +
				"components and tests/doc-gen/production boot byte-stable. Unexpected descriptors: " +
				string.Join(", ", registeredOtelComponents.Select(descriptor =>
					descriptor.ImplementationType?.FullName
					?? descriptor.ServiceType?.FullName
					?? "<unknown>")));
		} finally {
			Environment.SetEnvironmentVariable(OtlpEndpointVariableName, previous);
		}
	}
}
