#pragma warning disable IDE0005 // Using directive is unnecessary — false positive: IHostedService is not in any global using.
using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using Serilog;
using Serilog.Core;
using Serilog.Events;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// #1708: every async Serilog sink must drain on host shutdown. AddSerilog alone
// does not register a Log.CloseAndFlush hook on IHostApplicationLifetime, so
// LogEvents still queued at SIGTERM/StopAsync are dropped — and the dropped events
// are exactly the ones that explain why the process exited.
//
// DEPENDENCY: these tests mutate the process-global static Serilog.Log.Logger
// without a lock, and xUnit DOES run classes in parallel in this assembly
// (Tests/AssemblyInfo.cs sets [assembly: CollectionBehavior(MaxParallelThreads = 4)]
// and classes in different collections run concurrently even without that
// attribute). The named collection below with DisableParallelization = true
// serializes this class against every OTHER class that joins the same collection;
// any spec that also touches the static Log.Logger must join it rather than
// relying on cross-collection guarantees, which do not exist.
//
// The composition witness below pins the registration: both host roles must carry
// THE concrete SerilogFlushOnShutdown hosted service, the only type whose StopAsync
// drains anything. The two behavioral tests then pin the artifact itself: StopAsync
// must drain the async queue into its wrapped sink AND swap Log.Logger for Serilog's
// silent logger — the two observable halves of CloseAndFlush. The witness alone stays
// green if StopAsync is neutered (the round-1 blocker), and each behavioral half alone
// stays green under the other half's mutation, so the three tests pin the same
// contract from three directions.
[CollectionDefinition("SerilogGlobalLogger", DisableParallelization = true)]
public sealed class SerilogGlobalLoggerCollection;

[Collection("SerilogGlobalLogger")]
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

	[Fact]
	public async Task ItShouldDrainTheQueuedEventIntoTheWrappedSinkWhenItStops() {
		var canary = Guid.NewGuid().ToString("N");
		var collectingSink = new CollectingSink();
		var composed = new LoggerConfiguration()
			.MinimumLevel.Information()
			.WriteTo.Async(writeTo => writeTo.Sink(collectingSink))
			.CreateLogger();

		var previous = Serilog.Log.Logger;
		try {
			Serilog.Log.Logger = composed;
			Serilog.Log.Information("flush-canary {Canary}", canary);

			var flushHook = new SerilogFlushOnShutdown();
			await flushHook.StopAsync(CancellationToken.None);

			var canaryEvents = collectingSink.Events
				.Where(logEvent => logEvent.Properties.TryGetValue("Canary", out var property)
					&& property is ScalarValue scalar
					&& canary.Equals(scalar.Value))
				.ToList();

			canaryEvents.Should().NotBeEmpty(
				"StopAsync must drain the Serilog async queue into the wrapped sink before "
					+ "returning: the event buffered at shutdown is exactly what #1708 exists "
					+ "to deliver, and a stop that leaves it in the queue kills it with the "
					+ "process"
			);

			collectingSink.Disposed.Should().BeTrue(
				"CloseAndFlush tears the composed logger down in dependency order, so the "
					+ "async envelope is disposed only after its worker consumed the queue — "
					+ "an envelope that survives the stop keeps pumping on a background "
					+ "thread and offers no drain-before-exit guarantee (#1708)"
			);
		} finally {
			Serilog.Log.Logger = previous;
		}
	}

	[Fact]
	public async Task ItShouldSwapTheStaticLoggerForTheSilentOneWhenItStops() {
		var sentinel = new LoggerConfiguration()
			.MinimumLevel.Information()
			.CreateLogger();
		var previous = Serilog.Log.Logger;
		try {
			Serilog.Log.Logger = sentinel;

			var flushHook = new SerilogFlushOnShutdown();
			await flushHook.StopAsync(CancellationToken.None);

			Serilog.Log.Logger.Should().NotBeSameAs(
				sentinel,
				"Serilog's CloseAndFlush swaps Log.Logger for the silent logger once every "
					+ "sink drained (#1708); a StopAsync that leaves the pre-stop logger in "
					+ "place did not flush anything, so the events buffered at shutdown still "
					+ "die with the process"
			);
		} finally {
			Serilog.Log.Logger = previous;
		}
	}

	private static void AssertCarriesFlushHostedService(IServiceCollection services) {
		Type? flushHook = services
			.Where(descriptor => descriptor.ServiceType == typeof(IHostedService))
			.Select(descriptor => descriptor.ImplementationType)
			.FirstOrDefault(type => type is not null && type == typeof(SerilogFlushOnShutdown));

		flushHook.Should().NotBeNull(
			"the production host composition must register "
				+ nameof(SerilogFlushOnShutdown)
				+ " as an IHostedService: only that concrete type's StopAsync drains the "
				+ "Serilog async queue, so without it LogEvents queued at SIGTERM/StopAsync "
				+ "are dropped, and the dropped events are exactly the ones that explain why "
				+ "the process exited (#1708). Add the hook in ConfigureLogger or in "
				+ "CreateWebHostBuilder/CreateWorkerHostBuilder."
		);
	}

	private sealed class CollectingSink : ILogEventSink, IDisposable {
		private readonly object _gate = new();
		private readonly List<LogEvent> _events = [];

		private bool _disposed;

		public bool Disposed {
			get {
				lock (_gate) {
					return _disposed;
				}
			}
		}

		public IReadOnlyList<LogEvent> Events {
			get {
				lock (_gate) {
					return [.. _events];
				}
			}
		}

		public void Emit(LogEvent logEvent) {
			lock (_gate) {
				_events.Add(logEvent);
			}
		}

		public void Dispose() {
			lock (_gate) {
				_disposed = true;
			}
		}
	}
}
