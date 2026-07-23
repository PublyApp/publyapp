using System.Runtime.CompilerServices;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib;

public sealed class
	AppEnvironmentRateLimitSecuritySpec {
	[Theory]
	[InlineData("0.0.0.0/0")]
	[InlineData("::/0")]
	public void
	ItShouldRejectUniversalTrustedProxyNetworks(
		string cidr
	) {
		var environment = CreateEnvironmentWithProxy(
			cidr
		);

		var result = new AppEnvironmentValidator()
			.Validate(environment);

		result.Errors.Should().Contain(failure =>
			failure.PropertyName.StartsWith(
				nameof(AppEnvironment.TRUSTED_PROXY_CIDRS),
				StringComparison.Ordinal
			)
			&& failure.ErrorMessage.Contains(
				"must not trust a universal network",
				StringComparison.Ordinal
			)
		);
	}

	[Theory]
	[InlineData("172.18.0.5/32")]
	[InlineData("fd00::5/128")]
	public void
	ItShouldAcceptExactTrustedProxyAddresses(
		string cidr
	) {
		var environment = CreateEnvironmentWithProxy(
			cidr
		);

		var result = new AppEnvironmentValidator()
			.Validate(environment);

		result.Errors.Should().NotContain(failure =>
			failure.PropertyName.StartsWith(
				nameof(AppEnvironment.TRUSTED_PROXY_CIDRS),
				StringComparison.Ordinal
			)
		);
	}

	private static AppEnvironment
		CreateEnvironmentWithProxy(string cidr) {
		var environment = (AppEnvironment)
			RuntimeHelpers.GetUninitializedObject(
				typeof(AppEnvironment)
			);
		var field = typeof(AppEnvironment).GetField(
			"<TRUSTED_PROXY_CIDRS>k__BackingField",
			System.Reflection.BindingFlags.Instance
				| System.Reflection.BindingFlags.NonPublic
		);
		field.Should().NotBeNull();
		Assert.NotNull(field);
		field.SetValue(
			environment,
			new[] { cidr }
		);
		return environment;
	}
}
