using System.Globalization;
using System.Runtime.CompilerServices;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib;

public sealed class
	AppEnvironmentRateLimitSecuritySpec {
	// Environment variables are process-wide and xUnit schedules test classes
	// in parallel, so every test that mutates an env var below serializes on
	// this lock and restores the previous value in a finally block.
	private static readonly Lock EnvLock = new();

	[Theory]
	[InlineData(nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), "2048")]
	[InlineData(nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), "2048")]
	public void ItShouldReadTheUploadBudgetFromTheProcessEnvironment(
		string name,
		string value
	) {
		lock (EnvLock) {
			var previous = Environment.GetEnvironmentVariable(name);
			try {
				Environment.SetEnvironmentVariable(name, value);

				AppEnvironment.GetOptionalLong(name, 0)
					.Should().Be(long.Parse(
						value,
						NumberStyles.Integer,
						CultureInfo.InvariantCulture
					));
			} finally {
				Environment.SetEnvironmentVariable(name, previous);
			}
		}
	}

	[Theory]
	[InlineData(nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), 1_073_741_824L)]
	[InlineData(nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), 104_857_600L)]
	public void
	ItShouldFallBackToTheLiteralUploadBudgetDefaultWhenTheEnvironmentIsAbsentOrBlank(
		string name,
		long literalDefault
	) {
		lock (EnvLock) {
			var previous = Environment.GetEnvironmentVariable(name);
			try {
				foreach (var absentValue in new string?[] { null, "", "   " }) {
					Environment.SetEnvironmentVariable(name, absentValue);

					AppEnvironment.GetOptionalLong(
						name,
						GetUploadBudgetDefault(name)
					).Should().Be(literalDefault);
				}
			} finally {
				Environment.SetEnvironmentVariable(name, previous);
			}
		}
	}

	[Fact]
	public void ItShouldPinTheUploadBudgetDefaultsToTheirLiteralValues() {
		AppEnvironment.DefaultUploadGlobalMaxBytes.Should().Be(1_073_741_824L);
		AppEnvironment.DefaultUploadPerStaffMaxBytes.Should().Be(104_857_600L);
	}

	[Theory]
	[InlineData(nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), "not-a-number")]
	[InlineData(nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), "9223372036854775808")]
	[InlineData(nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), "-9223372036854775809")]
	[InlineData(nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), "not-a-number")]
	[InlineData(nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), "9223372036854775808")]
	[InlineData(nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), "-9223372036854775809")]
	public void ItShouldRejectNonNumericAndOverflowingUploadBudgetValues(
		string name,
		string value
	) {
		lock (EnvLock) {
			var previous = Environment.GetEnvironmentVariable(name);
			try {
				Environment.SetEnvironmentVariable(name, value);

				var act = () => AppEnvironment.GetOptionalLong(
					name,
					GetUploadBudgetDefault(name)
				);

				act.Should().Throw<InvalidOperationException>()
					.WithMessage($"*{name}*");
			} finally {
				Environment.SetEnvironmentVariable(name, previous);
			}
		}
	}

	[Theory]
	[InlineData(0, 10, "UPLOAD_GLOBAL_MAX_BYTES must be positive")]
	[InlineData(10, 0, "UPLOAD_PER_STAFF_MAX_BYTES must be positive")]
	[InlineData(-1, 10, "UPLOAD_GLOBAL_MAX_BYTES must be positive")]
	public void ItShouldRejectInvalidUploadAdmissionConfiguration(
		long globalBytes,
		long perStaffBytes,
		string expectedMessage
	) {
		var environment = CreateEnvironmentWithUploadBudgets(
			globalBytes,
			perStaffBytes
		);

		new AppEnvironmentValidator().Validate(environment).Errors
			.Should().Contain(error => error.ErrorMessage == expectedMessage);
	}

	[Fact]
	public void ItShouldRejectAGlobalUploadBudgetSmallerThanPerStaffBudget() {
		var environment = CreateEnvironmentWithUploadBudgets(9, 10);

		new AppEnvironmentValidator().Validate(environment).Errors
			.Should().Contain(error => error.ErrorMessage.Contains(
				"greater than or equal", StringComparison.Ordinal
			));
	}
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

	private static AppEnvironment CreateEnvironmentWithUploadBudgets(
		long globalBytes,
		long perStaffBytes
	) {
		var environment = (AppEnvironment)RuntimeHelpers.GetUninitializedObject(
			typeof(AppEnvironment)
		);
		SetBackingField(environment, nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES), globalBytes);
		SetBackingField(environment, nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES), perStaffBytes);
		return environment;
	}

	private static void SetBackingField(
		AppEnvironment environment,
		string propertyName,
		object value
	) {
		var field = typeof(AppEnvironment).GetField(
			$"<{propertyName}>k__BackingField",
			System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic
		);
		field.Should().NotBeNull();
		Assert.NotNull(field);
		field.SetValue(environment, value);
	}

	private static long GetUploadBudgetDefault(string name) {
		return name switch {
			nameof(AppEnvironment.UPLOAD_GLOBAL_MAX_BYTES) => AppEnvironment
				.DefaultUploadGlobalMaxBytes,
			nameof(AppEnvironment.UPLOAD_PER_STAFF_MAX_BYTES) => AppEnvironment
				.DefaultUploadPerStaffMaxBytes,
			_ => throw new ArgumentOutOfRangeException(
				nameof(name),
				name,
				"Unknown upload budget setting"
			),
		};
	}
}
