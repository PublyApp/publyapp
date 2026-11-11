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

// #1708. Serilog.Sinks.Async queues entries on a background thread; a host teardown that does
// not drain that queue loses the newest entries, the ones that explain WHY the process stopped.
//
// Honest scope: the host spec is a CONTRACT test for the teardown of the real ConfigureLogger
// pipeline (it is red if that teardown stops draining, e.g. a non-disposing bootstrap
// logger). It does NOT run Program.Main, so it is not the paired proof of `using var app`
// (that change only matters for the boot-probe early return, covered for crashes by
// MasterKeyWitnessBootIntegration.Spec, not for the flush). The overflow spec IS a real
// red/green pair: it goes red when `monitor:` is removed from the async sink under test.
public sealed class HostLogShutdownSpec {
	[Fact]
	public async Task ItShouldWaitForTheAsyncQueueAndWriteTheLastEntryWhenTheHostIsDisposed() {
		var sink = new GatedSink();
		var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings {
			EnvironmentName = EnvironmentNames.Production,
			ApplicationName = nameof(HostLogShutdownSpec),
		});
		builder.ConfigureLoggerWithExtraSink(w => w.Async(inner => inner.Sink(sink)));
		var host = builder.Build();
		await host.StartAsync();
		host.Services.GetRequiredService<Serilog.ILogger>().Information("last entry before stop");
		await sink.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

		await host.StopAsync();
		var disposalStarted =
			new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		var disposal = Task.Run(() => {
			disposalStarted.SetResult();
			host.Dispose();
		});
		await disposalStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
		var finishedEarly = await Task.WhenAny(disposal, Task.Delay(100)) == disposal;

		finishedEarly.Should().BeFalse("the teardown must wait for the queued entry (#1708)");
		sink.Gate.Set();
		await disposal.WaitAsync(TimeSpan.FromSeconds(10));
		sink.Messages.Should().Contain("last entry before stop");
	}

	[Fact]
	public async Task ItShouldReportTheDroppedEntriesOfARealAsyncSinkOnOverflow() {
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
	public void ItShouldReportEachIncreaseOnceAndStaySilentWhenNothingNewIsDropped() {
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
	public void ItShouldNotThrowWhenTheOutputIsClosed() {
		var output = new StringWriter(CultureInfo.InvariantCulture);
		output.Dispose();
		var monitor = new DroppedLogEntriesMonitor("info", output, TimeSpan.FromHours(1));

		var report = () => monitor.Report(new FakeInspector { DroppedMessagesCount = 1 });

		report.Should().NotThrow();
	}

	[Fact]
	public async Task ItShouldNotLetAWedgedOutputHoldTheFinalReportHostage() {
		using var output = new BlockedWriter();
		var monitor = new DroppedLogEntriesMonitor(
			"info",
			output,
			TimeSpan.FromHours(1),
			TimeSpan.FromMilliseconds(100)
		);
		var inspector = new FakeInspector { DroppedMessagesCount = 5 };

		var stop = Task.Run(() => monitor.StopMonitoring(inspector));

		await stop.WaitAsync(TimeSpan.FromSeconds(10));
		output.Release.Set();
	}

	private sealed class BlockedWriter : StringWriter {
		public BlockedWriter() : base(CultureInfo.InvariantCulture) {
		}

		public ManualResetEventSlim Release { get; } = new();

		public override void WriteLine(string? value) {
			this.Release.Wait(TimeSpan.FromSeconds(30));
		}
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
