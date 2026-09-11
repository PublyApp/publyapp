using System.Diagnostics;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Exercises the real test bootstrap in a separate process. The synthetic dotenv file uses
/// <c>APP_ROLE=api</c>, so the test can observe whether TestEnvironment's post-load pin keeps
/// the integration host on the All composition and its job-handler graph.
/// </summary>
public sealed class TestEnvironmentAppRoleBehaviorSpec {
	private const string _ProbeEnvironmentVariable =
		"PUBLYAPP_TEST_ENVIRONMENT_APP_ROLE_PROBE";
	private const string _SafeConnectionString =
		"Host=192.0.2.1;Port=1;Database=publyapp_test;"
		+ "Username=postgres;Password=not-a-real-password;Timeout=1";

	[Fact]
	public async Task ItShouldPinAllBeforeComposingTheApiFactoryWhenDotEnvSetsApi() {
		if (_IsChildProbe()) {
			_RunChildProbe();
			return;
		}

		var testAssemblyDirectory = Path.GetDirectoryName(
			typeof(TestEnvironmentAppRoleBehaviorSpec).Assembly.Location
		);
		if (testAssemblyDirectory is null) {
			throw new InvalidOperationException("The test assembly has no output directory.");
		}

		var envFilePath = Path.Combine(testAssemblyDirectory, ".env.development");
		if (File.Exists(envFilePath)) {
			throw new InvalidOperationException(
				$"Refusing to overwrite an existing child-probe dotenv file: {envFilePath}"
			);
		}

		File.WriteAllText(envFilePath, _SyntheticDotEnv);
		try {
			var result = await _RunChildTestAsync(testAssemblyDirectory);

			result.ExitCode.Should().Be(
				0,
				"the isolated test bootstrap and All host composition must succeed; "
				+ $"stdout: {result.Stdout} stderr: {result.Stderr}"
			);
			result.Stdout.Should().Contain("Passed:     1");
			result.Stdout.Should().Contain("Total:     1");
		} finally {
			File.Delete(envFilePath);
		}
	}

	private static bool _IsChildProbe() {
		return string.Equals(
			Environment.GetEnvironmentVariable(_ProbeEnvironmentVariable),
			"1",
			StringComparison.Ordinal
		);
	}

	private static void _RunChildProbe() {
		TestEnvironment.InitializeOnce(_SafeConnectionString);
		AppEnvironment.Initialize().Role.Should().Be(
			AppRole.All,
			"the real TestEnvironment bootstrap must re-pin APP_ROLE after dotenv loading"
		);
		AppEnvironment.Instance.APP_NAME.Should().Be(
			"SyntheticTestEnvironmentAppRole",
			$"the child must initialize from the synthetic dotenv file; cwd: "
			+ Directory.GetCurrentDirectory()
		);

		var storageRoot = Directory.CreateTempSubdirectory(
			"publyapp-test-environment-storage-"
		);
		try {
			using var factory = new ApiFactory(_SafeConnectionString, storageRoot.FullName);
			factory.Services.GetRequiredService<JobHandlerRegistry>().Should().NotBeNull();
		} finally {
			storageRoot.Delete(recursive: true);
		}
	}

	private static async Task<(int ExitCode, string Stdout, string Stderr)> _RunChildTestAsync(
		string workingDirectory
	) {
		var projectPath = _FindRepositoryFile(
			"apps/api/Tests/PublyApp.Api.Tests.csproj"
		);
		var startInfo = new ProcessStartInfo {
			FileName = Environment.ProcessPath ?? "dotnet",
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
			WorkingDirectory = workingDirectory,
		};
		startInfo.ArgumentList.Add("test");
		startInfo.ArgumentList.Add(projectPath);
		startInfo.ArgumentList.Add("-c");
		startInfo.ArgumentList.Add("Test");
		startInfo.ArgumentList.Add("--no-build");
		startInfo.ArgumentList.Add("--no-restore");
		startInfo.ArgumentList.Add("--filter");
		startInfo.ArgumentList.Add(
			$"FullyQualifiedName~{typeof(TestEnvironmentAppRoleBehaviorSpec).FullName}."
			+ nameof(ItShouldPinAllBeforeComposingTheApiFactoryWhenDotEnvSetsApi)
		);
		startInfo.ArgumentList.Add("--logger");
		startInfo.ArgumentList.Add("console;verbosity=minimal");
		startInfo.Environment[_ProbeEnvironmentVariable] = "1";

		using var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException("Failed to launch the isolated test probe.");
		}

		var stdoutTask = process.StandardOutput.ReadToEndAsync();
		var stderrTask = process.StandardError.ReadToEndAsync();
		using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
		try {
			await process.WaitForExitAsync(timeout.Token);
		} catch (OperationCanceledException) {
			if (!process.HasExited) {
				process.Kill(entireProcessTree: true);
			}

			await process.WaitForExitAsync();
		}

		return (
			process.ExitCode,
			await stdoutTask,
			await stderrTask
		);
	}

	private static string _FindRepositoryFile(string relativePath) {
		var starts = new[] {
			new DirectoryInfo(Directory.GetCurrentDirectory()),
			new DirectoryInfo(AppContext.BaseDirectory),
		};
		foreach (var start in starts) {
			var current = start;
			while (current is not null) {
				var candidate = Path.Combine(current.FullName, relativePath);
				if (File.Exists(candidate)) {
					return candidate;
				}

				current = current.Parent;
			}
		}

		throw new InvalidOperationException(
			$"Could not locate repository file '{relativePath}'."
		);
	}

	private static readonly string _SyntheticDotEnv = $"""
		APP_ROLE="api"
		POSTGRES_CONNECTION_STRING="{_SafeConnectionString}"
		FRONT_URL="http://localhost:5050"
		RESEND_API_KEY="not-a-real-key"
		STAFF_OWNER_EMAIL="owner@example.com"
		STAFF_OWNER_BOOTSTRAP_CODE="not-a-real-code"
		SOCIAL_ACCOUNTS_MASTER_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
		APP_NAME="SyntheticTestEnvironmentAppRole"
		DEFAULT_EMAIL_SENDER_EMAIL="no-reply@example.com"
		DEFAULT_EMAIL_SENDER_NAME="PublyApp Support"
		SESSION_TOKEN_HEADER_KEY="X-Session-Token"
		TENANT_ID_HEADER_KEY="X-PublyApp-TenantId"
		SESSION_EXPIRY_DAYS="7"
		EMAIL_VERIFY_TOKEN_VALIDITY_DURATION="7"
		PASSWORD_RESET_TOKEN_VALIDITY_DURATION="7"
		PASSWORD_MIN_LENGTH="12"
		EMAIL_VERIFY_TOKEN_LENGTH="25"
		PASSWORD_RESET_TOKEN_LENGTH="25"
		INVITATION_TOKEN_LENGTH="32"
		""";
}
