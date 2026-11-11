using System.Collections.Concurrent;
using System.Globalization;

using FluentAssertions;

using Microsoft.Extensions.Hosting;

using PublyApp.Api.Lib.Extensions;

using Serilog;
using Serilog.Core;
using Serilog.Events;
using Serilog.Sinks.Async;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// #1708 paired proof. Serilog.Sinks.Async queues entries (10 000 deep) for a background
// thread; stopping the host without draining that queue loses the newest entries — the very
// ones that explain WHY the process stopped.
//
// RED/GREEN (both deterministic, a fast disk cannot hide the loss):
// - ItShouldDrainTheAsyncQueueBeforeStopCompletes goes RED if FlushLogsOnStopHostedService.StopAsync
//   stops disposing the logger (the gated sink never receives the entry).
// - ItShouldRegisterTheFlushServiceFirstSoItStopsLast goes RED if ConfigureLogger stops registering it.
public sealed class FlushLogsOnStopSpec {
	[Fact]
	public async Task ItShouldDrainTheAsyncQueueBeforeStopCompletes() {
		var sink = new GatedSink();
		var logger = new LoggerConfiguration()
			.WriteTo.Async(w => w.Sink(sink))
			.CreateLogger();
		logger.Information("last entry before stop");
		var service = new FlushLogsOnStopHostedService(logger);
		using var release = new Timer(_ => sink.Gate.Set(), state: null, dueTime: 300, period: Timeout.Infinite);

		await service.StopAsync(CancellationToken.None);

		sink.Messages.Should().Contain(
			"last entry before stop",
			"StopAsync must block until the async queue is drained (#1708)"
		);
	}

	[Fact]
	public void ItShouldRegisterTheFlushServiceFirstSoItStopsLast() {
		var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings {
			EnvironmentName = EnvironmentNames.Production,
			ApplicationName = nameof(FlushLogsOnStopSpec),
		});
		builder.ConfigureLogger();

		var firstHostedService = builder.Services.First(d => d.ServiceType == typeof(IHostedService));

		firstHostedService.ImplementationType.Should().Be(typeof(FlushLogsOnStopHostedService));
	}

	[Fact]
	public void ItShouldReportDroppedEntriesOnceAndStaySilentWhenNothingMoreIsDropped() {
		using var output = new StringWriter(CultureInfo.InvariantCulture);
		var monitor = new DroppedLogEntriesMonitor("info", output, TimeSpan.FromHours(1));
		var inspector = new FakeInspector { DroppedMessagesCount = 7 };

		monitor.Report(inspector);
		monitor.Report(inspector);
		inspector.DroppedMessagesCount = 10;
		monitor.Report(inspector);

		var lines = output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
		lines.Should().HaveCount(2);
		lines[0].Should().Contain("'info'").And.Contain("7 entries dropped");
		lines[1].Should().Contain("3 entries dropped").And.Contain("10 in total");
	}

	private sealed class GatedSink : ILogEventSink {
		public ManualResetEventSlim Gate { get; } = new();
		public ConcurrentQueue<string> Messages { get; } = new();

		public void Emit(LogEvent logEvent) {
			this.Gate.Wait();
			this.Messages.Enqueue(logEvent.RenderMessage(CultureInfo.InvariantCulture));
		}
	}

	private sealed class FakeInspector : IAsyncLogEventSinkInspector {
		public int BufferSize { get; set; } = 10_000;
		public int Count { get; set; }
		public long DroppedMessagesCount { get; set; }
	}
}
