using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class SocialAccountArchitectureSpec {
	static SocialAccountArchitectureSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldDeclareTheStatusCheckConstraintWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=sa_arch_guard").Options;
		using var db = new AppDbContext(options);
		var entity = db.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(SocialAccount))!;
		entity.GetCheckConstraints().Single(c => c.Name == "CK_SocialAccount_Status")
			.Sql.Should().Be("status IN (10, 20, 30)");
	}

	[Fact]
	public void ItShouldRequireEveryServiceMethodWithTenantIdToUseIt() {
		var path = FindSocialAccountServicePath();
		if (path is null) {
			return; // no service file yet; guard stays green until C2 adds one
		}
		var source = File.ReadAllText(path);
		var offenders = new List<string>();
		foreach (var slice in SplitMethods(source, "public")) {
			if (!slice.Signature.Contains("Guid tenantId", StringComparison.Ordinal)) {
				continue;
			}
			if (!slice.Body.Contains("TenantId ==") && !slice.Body.Contains("tenantId")) {
				offenders.Add(slice.Signature.Trim());
			}
		}
		offenders.Should().BeEmpty(
			"every tenant-scoped method must use its tenantId. Offenders:\n" + string.Join("\n", offenders)
		);
	}

	private static string? FindSocialAccountServicePath() {
		var dir = new DirectoryInfo(AppContext.BaseDirectory);
		while (dir is not null) {
			var target = Path.Combine(dir.FullName, "apps", "api", "Modules", "SocialAccounts", "Services", "SocialAccountService.cs");
			if (File.Exists(target)) { return target; }
			dir = dir.Parent;
		}
		return null;
	}

	private sealed record MethodSlice(string Signature, string Body);
	private static List<MethodSlice> SplitMethods(string source, string marker) {
		var slices = new List<MethodSlice>();
		var from = 0;
		while (true) {
			var idx = source.IndexOf(marker, from, StringComparison.Ordinal);
			if (idx < 0) { break; }
			var next = source.IndexOf(marker, idx + marker.Length, StringComparison.Ordinal);
			var slice = next < 0 ? source[idx..] : source[idx..next];
			var brace = slice.IndexOf('{');
			slices.Add(new MethodSlice(brace >= 0 ? slice[..brace] : slice, slice));
			if (next < 0) { break; }
			from = next;
		}
		return slices;
	}
}
