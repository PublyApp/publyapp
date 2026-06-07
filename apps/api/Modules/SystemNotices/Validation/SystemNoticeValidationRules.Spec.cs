using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace PublyApp.Api.Modules.SystemNotices.Validation;

public sealed class SystemNoticeValidationRulesSpec {
	// ----- models -----

	private class RequiredSeverityModel {
		public JsonElement Severity { get; set; }
	}

	private class NullableSeverityModel {
		public JsonElement? Severity { get; set; }
	}

	// ----- validators -----

	private class RequiredSeverityValidator
		: AbstractValidator<RequiredSeverityModel> {
		public RequiredSeverityValidator() {
			RuleFor(x => x.Severity)
				.MustBeRequiredSeverity();
		}
	}

	private class NullableSeverityValidator
		: AbstractValidator<NullableSeverityModel> {
		public NullableSeverityValidator() {
			RuleFor(x => x.Severity)
				.MustBeNullableSeverity();
		}
	}

	// ============= MustBeRequiredSeverity =============

	[Theory]
	[InlineData("info")]
	[InlineData("warning")]
	[InlineData("critical")]
	[InlineData("Info")]
	[InlineData("WARNING")]
	public void ItShouldPassRequiredSeverityWhenValid(string value) {
		var model = new RequiredSeverityModel {
			Severity = JsonSerializer.SerializeToElement(value),
		};
		var result = new RequiredSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredSeverityWhenInvalidValue() {
		var model = new RequiredSeverityModel {
			Severity = JsonSerializer.SerializeToElement("unknown"),
		};
		var result = new RequiredSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
		_ = result.Errors.Should().Contain(
			e => e.ErrorMessage.Contains("info, warning, critical")
		);
	}

	[Fact]
	public void ItShouldFailRequiredSeverityWhenWrongType() {
		var model = new RequiredSeverityModel {
			Severity = JsonSerializer.SerializeToElement(42),
		};
		var result = new RequiredSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredSeverityWhenEmpty() {
		var model = new RequiredSeverityModel { Severity = default };
		var result = new RequiredSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBeNullableSeverity =============

	[Fact]
	public void ItShouldPassNullableSeverityWhenNull() {
		var model = new NullableSeverityModel { Severity = null };
		var result = new NullableSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableSeverityWhenJsonNull() {
		var model = new NullableSeverityModel {
			Severity = JsonDocument.Parse("null").RootElement,
		};
		var result = new NullableSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Theory]
	[InlineData("info")]
	[InlineData("warning")]
	[InlineData("critical")]
	public void ItShouldPassNullableSeverityWhenValid(string value) {
		var model = new NullableSeverityModel {
			Severity = JsonSerializer.SerializeToElement(value),
		};
		var result = new NullableSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableSeverityWhenInvalidValue() {
		var model = new NullableSeverityModel {
			Severity = JsonSerializer.SerializeToElement("unknown"),
		};
		var result = new NullableSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
		_ = result.Errors.Should().Contain(
			e => e.ErrorMessage.Contains("info, warning, critical")
		);
	}

	[Fact]
	public void ItShouldFailNullableSeverityWhenWrongType() {
		var model = new NullableSeverityModel {
			Severity = JsonSerializer.SerializeToElement(true),
		};
		var result = new NullableSeverityValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
