using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// #1708: every async Serilog sink must drain on host shutdown. AddSerilog alone
// does not register a Log.CloseAndFlush hook on IHostApplicationLifetime, so
// LogEvents still queued at SIGTERM/StopAsync are dropped — and the dropped events
// are exactly the ones that explain why the process exited. The paired proof
// (proof-1708.md): strip the flush hook from the host composition and this spec
// goes red, naming the cause.
//
// This spec asserts the production composition wires a hosted service that
// calls Log.CloseAndFlush() on host stop. The concrete detection is structural:
// the builder's IServiceCollection must contain a hosted service descriptor
// whose implementation type lives in PublyApp.Api.Lib.Logging (the only
// namespace the shipped flush hook can be added under, by convention) AND
// whose type name ends in "FlushOnShutdown" (the convention
// LoggerConfigExtensions/ConfigureLogger is expected to follow). Without the
// hook, the collection does not contain any matching descriptor and the
// assertion names the missing hook.
//
// The assertion reads the builder's service collection (not the built host),
// so it does not need a database or a running web server. Program.CreateWebHostBuilder
// and CreateWorkerHostBuilder compose the production service graph in-process.
public sealed class SerilogAsyncSinkDrainSpec {
	[Fact]
	public void ItShouldRegisterAHostedServiceThatFlushesTheSerilogQueueOnShutdown() {
		var webBuilder = Program.CreateWebHostBuilder(
			Array.Empty<string>(),
			AppRole.Api
		);
		AssertCarriesFlushHostedService(webBuilder.Services);

		var workerBuilder = Program.CreateWorkerHostBuilder(Array.Empty<string>());
		AssertCarriesFlushHostedService(workerBuilder.Services);
	}

	private static void AssertCarriesFlushHostedService(IServiceCollection services) {
		var flushHook = services
			.Where(descriptor => descriptor.ServiceType == typeof(IHostedService))
			.Select(descriptor => descriptor.ImplementationType)
			.FirstOrDefault(type => type is not null
				&& type.FullName?.StartsWith(
					"PublyApp.Api.Lib.Logging",
					StringComparison.Ordinal
				) == true
				&& type.Name.EndsWith(
					"FlushOnShutdown",
					StringComparison.Ordinal
				)
			);

		flushHook.Should().NotBeNull(
			"the production host composition must register an IHostedService in "
				+ "PublyApp.Api.Lib.Logging that flushes the Serilog async queue on "
				+ "shutdown — without it, LogEvents queued at SIGTERM/StopAsync are "
				+ "dropped, and the dropped events are exactly the ones that explain "
				+ "why the process exited (#1708). Add the hook in ConfigureLogger or "
				+ "in CreateWebHostBuilder/CreateWorkerHostBuilder."
		);
	}
}
