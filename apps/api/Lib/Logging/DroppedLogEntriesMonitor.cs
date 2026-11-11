using Serilog.Sinks.Async;

namespace PublyApp.Api.Lib.Logging;

/// <summary>
/// Makes Serilog.Sinks.Async overflow visible (#1708). The async sinks keep the default
/// "drop when the queue is full" policy so a request thread is never blocked by a slow
/// disk, but a drop must never be silent: this monitor polls the sink's dropped counter
/// and reports every increase.
/// <para>
/// The report goes straight to stderr, NOT through the Serilog pipeline: the pipeline is
/// the thing that is saturated, and a warning routed through it would be dropped too.
/// stderr is captured by the container runtime like stdout.
/// </para>
/// </summary>
public sealed class DroppedLogEntriesMonitor : IAsyncLogEventSinkMonitor {
	private readonly Lock _Lock = new();
	private readonly TextWriter? _Output;
	private readonly TimeSpan _PollInterval;
	private readonly string _SinkName;
	private long _Reported;
	private Timer? _Timer;

	public DroppedLogEntriesMonitor(
		string sinkName,
		TextWriter? output = null,
		TimeSpan? pollInterval = null
	) {
		this._SinkName = sinkName;
		this._Output = output;
		this._PollInterval = pollInterval ?? TimeSpan.FromSeconds(5);
	}

	public void StartMonitoring(IAsyncLogEventSinkInspector inspector) {
		lock (this._Lock) {
			this._Timer = new Timer(
				_ => this.Report(inspector),
				state: null,
				dueTime: this._PollInterval,
				period: this._PollInterval
			);
		}
	}

	public void StopMonitoring(IAsyncLogEventSinkInspector inspector) {
		lock (this._Lock) {
			this._Timer?.Dispose();
			this._Timer = null;
		}

		// Final check: entries dropped since the last poll must still be reported.
		this.Report(inspector);
	}

	public void Report(IAsyncLogEventSinkInspector inspector) {
		lock (this._Lock) {
			var dropped = inspector.DroppedMessagesCount;
			if (dropped <= this._Reported) {
				return;
			}

			var delta = dropped - this._Reported;
			this._Reported = dropped;

			var writer = this._Output ?? Console.Error;
			writer.WriteLine(
				$"[WRN] Log queue '{this._SinkName}' overflowed: {delta} entries dropped "
				+ $"({dropped} in total since start, buffer size {inspector.BufferSize})."
			);
		}
	}
}
