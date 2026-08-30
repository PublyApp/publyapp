#pragma warning disable IDE0005 // Using directive is unnecessary — false positive: IHostedService is not in any global using.
using Microsoft.Extensions.Hosting;

namespace PublyApp.Api.Lib.Logging;
// #1708: drain the Serilog async queue on host shutdown. AddSerilog alone does
// not register a Log.CloseAndFlush hook on IHostApplicationLifetime, so
// LogEvents still queued at SIGTERM/StopAsync are dropped — and the dropped
// events are exactly the ones that explain why the process exited.
//
// IHostedService.StopAsync is the documented hook for "about to stop, give me
// one last synchronous turn" on the way out. The host calls each registered
// hosted service's StopAsync in registration REVERSE order so the LAST thing
// the API/worker does on shutdown is flush its log queue. Log.CloseAndFlush
// is the synchronous, blocking flush Serilog itself recommends; it is fine to
// call here because the host is already past request handling and is
// committed to tearing down anyway.
public sealed class SerilogFlushOnShutdown : IHostedService {
	public Task StartAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}

	public Task StopAsync(CancellationToken cancellationToken) {
		// CloseAndFlush is the documented way to drain every sink the static
		// Log.Logger knows about, including async ones — and a non-throwing
		// sink failure inside one sink must not prevent the other sinks
		// from flushing, so a try/catch here would mask the very events we
		// are trying to capture. The matching hosted-service registration
		// lives in LoggerConfigExtensions.ConfigureLogger.
		global::Serilog.Log.CloseAndFlush();
		return Task.CompletedTask;
	}
}
