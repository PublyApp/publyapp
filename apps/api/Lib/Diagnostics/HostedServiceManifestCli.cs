namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Out-of-process composition probe for the APP_ROLE guard (design §3.2, finding F2).
/// Dispatched in Program.Main after AppEnvironment.Initialize and before any host runs:
/// when invoked as <c>dotnet PublyApp.Api.dll --print-hosted-services</c> it composes the
/// SAME host the configured APP_ROLE would run, resolves the EXACT
/// <see cref="IHostedService"/> collection <c>Host.StartAsync</c> would start, writes each
/// concrete type's full name to stdout (one per line, <see cref="LinePrefix"/>-prefixed,
/// terminated by <see cref="EndMarker"/>), and exits 0 WITHOUT binding a socket or running
/// the host.
/// <para>
/// This is what lets <c>AppRoleCompositionSpec</c> assert the api-role hosted-service graph
/// under a REAL Production process — <c>ASPNETCORE_ENVIRONMENT=Production</c>,
/// <c>APP_ROLE=api</c> — where BOTH <c>AppEnvironment</c> and the host's
/// <c>IHostEnvironment</c> resolve to Production exactly as deployment does. An in-process
/// test cannot: the integration fixture pins <c>ASPNETCORE_ENVIRONMENT=Testing</c>
/// process-wide, so a future Production-only hosted registration would be invisible to a
/// same-process guard. The probe closes that Testing-vs-Production gap by resolving the
/// graph in a process configured exactly like production.
/// </para>
/// </summary>
public static class HostedServiceManifestCli {
	public const string PrintArg = "--print-hosted-services";

	// A stable, greppable line contract the spawning test parses. One resolved concrete
	// hosted-service type per LinePrefix line; EndMarker proves the enumeration completed
	// (a crash mid-compose would omit it, so the test never mistakes a partial dump for a
	// clean graph).
	public const string LinePrefix = "HOSTED_SERVICE:";
	public const string EndMarker = "HOSTED_SERVICES_END";

	public const int SuccessExitCode = 0;

	/// <summary>
	/// Returns true iff the args request the probe (command handled). On handling, prints
	/// the resolved hosted-service manifest and sets <see cref="Environment.ExitCode"/>.
	/// </summary>
	public static bool TryRun(string[] args, AppRole role) {
		if (args.Length == 0
			|| !args[0].Equals(PrintArg, StringComparison.Ordinal)) {
			return false;
		}

		// Compose the exact host the role runs (never started), then resolve the collection
		// Host.StartAsync would start — whatever registration shape produced it.
		IHost host;
		if (role is AppRole.Worker) {
			host = Program.CreateWorkerHostBuilder([]).Build();
		} else {
			host = Program.CreateWebHostBuilder([], role).Build();
		}

		using (host) {
			foreach (var hostedService in host.Services.GetServices<IHostedService>()) {
				var type = hostedService.GetType();
				Console.Out.WriteLine($"{LinePrefix}{type.FullName ?? type.Name}");
			}
		}

		Console.Out.WriteLine(EndMarker);
		Console.Out.Flush();
		Environment.ExitCode = SuccessExitCode;

		return true;
	}
}
