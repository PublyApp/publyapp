using System.Collections.Concurrent;
using System.Globalization;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Lib.Extensions;

using Serilog;
using Serilog.Core;
using Serilog.Events;
using Serilog.Sinks.Async;

using Xunit;

namespace PublyApp.Api.Lib.Logging;

// #1708 paired proofs. Serilog.Sinks.Async queues entries on a background thread; shutting a
// host down without draining that queue loses the newest entries, the ones that explain WHY
// the process stopped.
//
// RED/GREEN:
// - HostShutdown...: goes RED if the host teardown stops draining the real ConfigureLogger
//   pipeline (the dispose returns while the gated sink still holds the entry).
// - Overflow...: goes RED if `monitor:` is removed from the async sink under test.
public sealed class FlushLogsOnStopSpec {
	[Fact]
	public async Task HostShutdownWaitsForTheAsyncQueueAndWritesTheLastEntry() {
		var sink = new GatedSink();
		var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings {
			EnvironmentName = EnvironmentNames.Production,
			ApplicationName = nameof(FlushLogsOnStopSpec),
		});
		builder.ConfigureLogger(config => config.WriteTo.Async(w => w.Sink(sink)));
		var host = builder.Build();
		await host.StartAsync();
		host.Services.GetRequiredService<Serilog.ILogger>().Information("last entry before stop");
		await sink.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

		await host.StopAsync();
		var disposal = Task.Run(host.Dispose);
		var finishedEarly = await Task.WhenAny(disposal, Task.Delay(250)) == disposal;

		finishedEarly.Should().BeFalse("the teardown must wait for the queued entry (#1708)");
		sink.Gate.Set();
		await disposal.WaitAsync(TimeSpan.FromSeconds(10));
		sink.Messages.Should().Contain("last entry before stop");
	}

	[Fact]
	public async Task OverflowOfARealAsyncSinkIsReportedByTheMonitor() {
		var sink = new GatedSink();
		using var output = new StringWriter(CultureInfo.InvariantCulture);
		var logger = new LoggerConfiguration()
			.WriteTo.Async(
				w => w.Sink(sink),
				bufferSize: 1,
				monitor: new DroppedLogEntriesMonitor("test", output, TimeSpan.FromHours(1))
			)
			.CreateLogger();
		logger.Information("held by the sink");
		await sink.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
		logger.Information("fills the buffer");
		logger.Information("dropped one");
		logger.Information("dropped two");

		sink.Gate.Set();
		logger.Dispose();

		output.ToString().Should().Contain("'test' overflowed: 2 entries dropped");
	}

	[Fact]
	public void MonitorReportsEachIncreaseOnceAndStaysSilentWhenNothingNewIsDropped() {
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

	[Fact]
	public void MonitorSwallowsAClosedOutputInsteadOfThrowingIntoShutdown() {
		var output = new StringWriter(CultureInfo.InvariantCulture);
		output.Dispose();
		var monitor = new DroppedLogEntriesMonitor("info", output, TimeSpan.FromHours(1));

		var report = () => monitor.Report(new FakeInspector { DroppedMessagesCount = 1 });

		report.Should().NotThrow();
	}

	private sealed class GatedSink : ILogEventSink {
		public ManualResetEventSlim Gate { get; } = new();
		public TaskCompletionSource Entered { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);
		public ConcurrentQueue<string> Messages { get; } = new();

		public void Emit(LogEvent logEvent) {
			this.Entered.TrySetResult();
			this.Gate.Wait(TimeSpan.FromSeconds(30));
			this.Messages.Enqueue(logEvent.RenderMessage(CultureInfo.InvariantCulture));
		}
	}

	private sealed class FakeInspector : IAsyncLogEventSinkInspector {
		public int BufferSize { get; set; } = 10_000;
		public int Count { get; set; }
		public long DroppedMessagesCount { get; set; }
	}
}
