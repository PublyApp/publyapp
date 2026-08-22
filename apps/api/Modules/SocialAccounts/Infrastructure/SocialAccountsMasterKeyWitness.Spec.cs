using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class SocialAccountsMasterKeyWitnessSpec {
	[Fact]
	public void ItShouldPassWhenTheMasterKeyIsCorrectlyConfigured() {
		var services = BuildServices();
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(services);
		act.Should().NotThrow();
	}

	[Fact]
	public void ItShouldThrowWhenTheMasterKeyIsMissing() {
		var protector = new ThrowingProtector(
			new InvalidOperationException("key not configured")
		);
		var services = BuildServicesWithProtector(protector);
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(services);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*missing or wrong*");
	}

	[Fact]
	public void ItShouldRefuseToBootWhenKeyCannotUnprotectExistingRing() {
		var protector = new UnprotectFailingProtector();
		var services = BuildServicesWithProtector(protector);
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(services);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*missing or wrong*");
	}

	private static IServiceProvider BuildServices() {
		var services = new ServiceCollection();
		services.AddSingleton<ICredentialProtector>(
			new CredentialProtector(
				Microsoft.AspNetCore.DataProtection.DataProtectionProvider
					.Create("witness-test")
			)
		);
		return services.BuildServiceProvider();
	}

	private static IServiceProvider BuildServicesWithProtector(
		ICredentialProtector protector
	) {
		var services = new ServiceCollection();
		services.AddSingleton(protector);
		return services.BuildServiceProvider();
	}

	/// <summary>Fake that throws on Protect (simulates missing key).</summary>
	private sealed class ThrowingProtector(Exception exception)
		: ICredentialProtector {
		public string Protect(string plaintext, SocialProvider provider)
			=> throw exception;
		public string? Unprotect(
			string? protectedText, SocialProvider provider
		) => throw exception;
	}

	/// <summary>
	/// Fake that Protects fine but Unprotect throws CryptographicException
	/// (simulates wrong-key ring).
	/// </summary>
	private sealed class UnprotectFailingProtector : ICredentialProtector {
		public string Protect(string plaintext, SocialProvider provider)
			=> $"protected:{plaintext}";
		public string? Unprotect(
			string? protectedText, SocialProvider provider
		) => throw new System.Security.Cryptography.CryptographicException(
			"Key mismatch"
		);
	}
}
