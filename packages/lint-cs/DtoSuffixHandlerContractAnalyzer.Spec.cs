using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.DtoSuffixHandlerContractAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class DtoSuffixHandlerContractAnalyzerSpec
{
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0004.severity = warning
		""";

	private const string ExpectedMessage =
		"Do not use the Dto suffix for handler contract types; use named contracts like "
		+ "Body, Query, Result, Response, or Item";

	// Positional records in the fixtures generate init-only setters, which require the
	// IsExternalInit marker type. The analyzer test compilation's reference set does not include
	// it, so provide a minimal polyfill (outside any handler path so the analyzer ignores it).
	private const string IsExternalInitPolyfill = """
		namespace System.Runtime.CompilerServices
		{
			internal static class IsExternalInit
			{
			}
		}
		""";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenClassEndsWithDtoAndIsUnderHandlersPath()
	{
		const string source = """
			namespace Sample;

			public sealed class {|#0:CreateUserDto|}
			{
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0004)
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(
			source,
			"apps/api/Modules/Users/Handlers/CreateUser/CreateUserHandler.cs",
			expected
		);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenStructEndsWithDtoAndIsUnderHandlersPath()
	{
		const string source = """
			namespace Sample;

			public readonly struct {|#0:CreateUserDto|}(int UserId, string Name);
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0004)
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(
			source,
			"apps/api/Modules/Users/Handlers/CreateUser/CreateUserHandler.cs",
			expected
		);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenRecordStructEndsWithDtoAndIsUnderHandlersPath()
	{
		const string source = """
			namespace Sample;

			public readonly record struct {|#0:CreateUserDto|}(int UserId, string Name);
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0004)
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(
			source,
			"apps/api/Modules/Users/Handlers/CreateUser/CreateUserHandler.cs",
			expected
		);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticWhenRecordEndsWithDtoOutsideHandlersPath()
	{
		const string source = """
			namespace Sample;

			public sealed record CreateUserDto(int UserId, string Name);
			""";

		await VerifyEnabledAsync(
			source,
			"apps/api/Modules/Users/Dtos/CreateUserDto.cs"
		);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticWhenDtoEndsWithDtoAndIsInHandlersSpecFile()
	{
		const string source = """
			namespace Sample;

			public sealed record CreateUserDto(int UserId, string Name);
			""";

		await VerifyEnabledAsync(
			source,
			"apps/api/Modules/Users/Handlers/CreateUser/CreateUser.Spec.cs"
		);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticForHandlerContractNamesThatDoNotEndWithDto()
	{
		const string source = """
			namespace Sample;

			public sealed record CreateUserBody(int UserId, string Name);
			public sealed record UpdateUserResult(int UserId);
			public sealed class UserResponse
			{
			}
			public struct UserItem
			{
			}
			""";

		await VerifyEnabledAsync(
			source,
			"apps/api/modules/users/handlers/CreateUser/request.cs"
		);
	}

	[Fact]
	public void ItShouldExposeDtoSuffixHandlerContractDiagnosticMetadata()
	{
		var analyzer = new DtoSuffixHandlerContractAnalyzer();
		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0004, descriptor.Id);
		Assert.Equal(
			"Avoid Dto suffix on handler contract types",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Naming", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static async Task VerifyEnabledAsync(
		string source,
		string filePath,
		params DiagnosticResult[] expected)
	{
		var test = new CSharpAnalyzerTest<DtoSuffixHandlerContractAnalyzer, DefaultVerifier>();

		test.TestState.Sources.Add((filePath, source));
		test.TestState.Sources.Add(("IsExternalInitPolyfill.cs", IsExternalInitPolyfill));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
