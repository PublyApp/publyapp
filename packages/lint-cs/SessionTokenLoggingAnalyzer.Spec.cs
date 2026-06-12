using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.SessionTokenLoggingAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.SessionTokenLoggingAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class SessionTokenLoggingAnalyzerSpec
{
	// PUBLY0010 ships disabled-by-default, so the test harness must explicitly enable it via an
	// .editorconfig entry before the analyzer will surface any diagnostic.
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0010.severity = warning
		""";

	// A minimal ILogger stub so the source compiles without referencing
	// Microsoft.Extensions.Logging; matching is name/syntax based, so the stub shape suffices.
	private const string LoggerStub = """
		namespace Microsoft.Extensions.Logging
		{
			public interface ILogger
			{
				void Log(string message);
				void LogTrace(string message, params object[] args);
				void LogDebug(string message, params object[] args);
				void LogInformation(string message, params object[] args);
				void LogWarning(string message, params object[] args);
				void LogError(string message, params object[] args);
				void LogCritical(string message, params object[] args);
				System.IDisposable BeginScope(string message, params object[] args);
			}
		}
		""";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenSessionTokenIsPassedAsLogArgument()
	{
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Example
			{
				public void Run(ILogger logger, string sessionToken)
				{
					logger.LogInformation("token={Token}", {|#0:sessionToken|});
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0, "sessionToken"));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenSessionTokenMemberIsInterpolatedIntoLogMessage()
	{
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Session
			{
				public string SessionToken { get; set; } = string.Empty;
			}

			public sealed class Example
			{
				public void Run(ILogger logger, Session session)
				{
					logger.LogDebug({|#0:$"X-Session-Token: {session.SessionToken}"|});
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0, "$\"X-Session-Token: {session.SessionToken}\""));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenSessionTokenMemberIsInterpolatedWithPrivateLoggerField()
	{
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class AuthContext
			{
				public string SessionToken { get; set; } = string.Empty;
			}

			public sealed class Example
			{
				private readonly ILogger _logger;

				public Example(ILogger logger)
				{
					_logger = logger;
				}

				public void Run(AuthContext context)
				{
					_logger.LogError({|#0:$"failed for {context.SessionToken}"|});
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0, "$\"failed for {context.SessionToken}\""));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenXSessionTokenHeaderLiteralIsLogged()
	{
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Example
			{
				public void Run(ILogger logger)
				{
					logger.LogWarning({|#0:"X-Session-Token"|});
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0, "\"X-Session-Token\""));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenLoggingNonSensitiveValues()
	{
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Example
			{
				public void Run(ILogger logger, string userId)
				{
					logger.LogInformation("user logged in {UserId}", userId);
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenSessionTokenIsPassedToNonLoggingMethod()
	{
		const string source = """
			namespace Sample;

			public sealed class Repository
			{
				public void Save(string sessionToken)
				{
				}
			}

			public sealed class Example
			{
				public void Run(Repository repo, string sessionToken)
				{
					repo.Save(sessionToken);
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenLoggingGenericTokenVocabulary()
	{
		// Conservative matching: a variable literally named token/authToken is NOT session-token
		// vocabulary and must not be flagged.
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Example
			{
				public void Run(ILogger logger, string token, string authToken)
				{
					logger.LogInformation("token={Token} authToken={AuthToken}", token, authToken);
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenSessionTokenIsReferencedOnNonLoggerReceiver()
	{
		// `Log` method on a non-logger receiver must not trigger the rule even with session-token
		// vocabulary in the argument.
		const string source = """
			namespace Sample;

			public sealed class Auditor
			{
				public void Log(string message)
				{
				}
			}

			public sealed class Example
			{
				public void Run(Auditor auditor, string sessionToken)
				{
					auditor.Log(sessionToken);
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCodeIsGenerated()
	{
		const string source = """
			using System.CodeDom.Compiler;
			using Microsoft.Extensions.Logging;

			namespace Sample;

			[GeneratedCode("Tool", "1.0.0")]
			public sealed class GeneratedExample
			{
				public void Run(ILogger logger, string sessionToken)
				{
					logger.LogInformation("token={Token}", sessionToken);
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleIsDisabledByDefault()
	{
		// The Microsoft.CodeAnalysis.Testing harness force-enables the analyzer under test, so it
		// cannot model the default-off behavior. Drive a raw Roslyn compilation (no .editorconfig)
		// instead: with isEnabledByDefault: false and no config to turn it on, the analyzer must
		// stay silent even though the source clearly logs a session token.
		const string source = """
			using Microsoft.Extensions.Logging;

			namespace Sample;

			public sealed class Example
			{
				public void Run(ILogger logger, string sessionToken)
				{
					logger.LogInformation("token={Token}", sessionToken);
				}
			}
			""";

		var compilation = CSharpCompilation.Create(
			"DefaultOffAssembly",
			[
				CSharpSyntaxTree.ParseText(source),
				CSharpSyntaxTree.ParseText(LoggerStub),
			],
			[
				MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
			],
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

		var analyzers = ImmutableArray.Create<DiagnosticAnalyzer>(new AnalyzerUnderTest());
		var withAnalyzers = compilation.WithAnalyzers(analyzers);

		var diagnostics = await withAnalyzers.GetAnalyzerDiagnosticsAsync();

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0010);
	}

	[Fact]
	public void ItShouldExposeSessionTokenLoggingDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0010, descriptor.Id);
		Assert.Equal(
			"Do not log session-token values",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Security", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Warning, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedAt(int marker, string matchedText)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0010)
			.WithLocation(marker)
			.WithArguments(matchedText);
	}

	private static async Task VerifyEnabledAsync(
		string source,
		params DiagnosticResult[] expected)
	{
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>
		{
			TestState =
			{
				Sources = { source, LoggerStub },
			},
		};

		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
