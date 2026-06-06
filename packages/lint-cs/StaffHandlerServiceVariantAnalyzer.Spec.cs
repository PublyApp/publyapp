using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.StaffHandlerServiceVariantAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.StaffHandlerServiceVariantAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class StaffHandlerServiceVariantAnalyzerSpec
{
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0007.severity = warning
		""";

	private const string ExpectedMessage =
		"Call the staff service variant when available in staff handlers";

	private const string StaffHandlerPath = "apps/api/Modules/Tenants/Handlers/Staff/TenantHandler.cs";

	[Fact]
	public async Task ItShouldFlagBaseServiceCallInStaffHandlerWhenStaffVariantExists()
	{
		const string source = """
			using System.Threading.Tasks;
			using System;

			namespace Sample;

			public sealed class TenantService
			{
				public Task<string> GetTenantByIdAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}

				public Task<string> GetTenantByIdForStaffAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class StaffTenantHandler
			{
				public Task HandleAsync(TenantService service, Guid tenantId)
				{
					return service.{|#0:GetTenantByIdAsync|}(tenantId);
				}
			}
			""";

		var expected = Verifier.Diagnostic(DiagnosticIds.PUBLY0007)
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(StaffHandlerPath, source, expected);
	}

	[Fact]
	public async Task ItShouldNotFlagForStaffServiceCallInStaffHandlerWhenStaffVariantExists()
	{
		const string source = """
			using System.Threading.Tasks;
			using System;

			namespace Sample;

			public sealed class TenantService
			{
				public Task<string> GetTenantByIdAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}

				public Task<string> GetTenantByIdForStaffAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class StaffTenantHandler
			{
				public Task HandleAsync(TenantService service, Guid tenantId)
				{
					return service.GetTenantByIdForStaffAsync(tenantId);
				}
			}
			""";

		await VerifyEnabledAsync(
			StaffHandlerPath,
			source);
	}

	[Fact]
	public async Task ItShouldNotFlagBaseServiceCallInStaffHandlerWhenNoStaffVariantExists()
	{
		const string source = """
			using System.Threading.Tasks;
			using System;

			namespace Sample;

			public sealed class TenantService
			{
				public Task<string> GetTenantByIdAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class StaffTenantHandler
			{
				public Task HandleAsync(TenantService service, Guid tenantId)
				{
					return service.GetTenantByIdAsync(tenantId);
				}
			}
			""";

		await VerifyEnabledAsync(
			StaffHandlerPath,
			source);
	}

	[Fact]
	public async Task ItShouldNotFlagNonServiceCallInStaffHandlerWhenStaffVariantExists()
	{
		const string source = """
			using System.Threading.Tasks;
			using System;

			namespace Sample;

			public sealed class TenantLookup
			{
				public Task<string> GetTenantByIdAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}

				public Task<string> GetTenantByIdForStaffAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class StaffTenantHandler
			{
				public Task HandleAsync(TenantLookup lookup, Guid tenantId)
				{
					return lookup.GetTenantByIdAsync(tenantId);
				}
			}
			""";

		await VerifyEnabledAsync(StaffHandlerPath, source);
	}

	[Fact]
	public async Task ItShouldFlagGenericBaseServiceCallWhenStaffVariantMatches()
	{
		const string source = """
			using System.Threading.Tasks;

			namespace Sample;

			public sealed class TenantService
			{
				public Task<string> GetAsync<T>(T id)
				{
					return Task.FromResult("tenant");
				}

				public Task<string> GetForStaffAsync<T>(T id)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class StaffTenantHandler
			{
				public Task HandleAsync(TenantService service, string tenantId)
				{
					return service.{|#0:GetAsync|}(tenantId);
				}
			}
			""";

		var expected = Verifier.Diagnostic(DiagnosticIds.PUBLY0007)
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(StaffHandlerPath, source, expected);
	}

	[Fact]
	public async Task ItShouldNotFlagServiceCallWhenStaffVariantRefKindDoesNotMatch()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class TenantService
			{
				public bool TryGetTenant(Guid tenantId, out string tenant)
				{
					tenant = "tenant";
					return true;
				}

				public bool TryGetTenantForStaff(Guid tenantId, ref string tenant)
				{
					tenant = "tenant";
					return true;
				}
			}

			public sealed class StaffTenantHandler
			{
				public bool Handle(TenantService service, Guid tenantId)
				{
					return service.TryGetTenant(tenantId, out var tenant);
				}
			}
			""";

		await VerifyEnabledAsync(StaffHandlerPath, source);
	}

	[Fact]
	public async Task ItShouldNotFlagBaseServiceCallOutsideStaffHandlerPath()
	{
		const string source = """
			using System.Threading.Tasks;
			using System;

			namespace Sample;

			public sealed class TenantService
			{
				public Task<string> GetTenantByIdAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}

				public Task<string> GetTenantByIdForStaffAsync(Guid tenantId)
				{
					return Task.FromResult("tenant");
				}
			}

			public sealed class TenantHandler
			{
				public Task HandleAsync(TenantService service, Guid tenantId)
				{
					return service.GetTenantByIdAsync(tenantId);
				}
			}
			""";

		await VerifyEnabledAsync(
			"apps/api/Modules/Tenants/Handlers/Tenant/TenantHandler.cs",
			source);
	}

	[Fact]
	public void ItShouldExposeStaffHandlerServiceVariantMetadata()
	{
		var analyzer = new AnalyzerUnderTest();
		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0007", descriptor.Id);
		Assert.Equal(
			"Use the staff service variant in staff handlers",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Authorization", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static async Task VerifyEnabledAsync(
		string fileName,
		string source,
		params DiagnosticResult[] expected
	) {
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();

		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
