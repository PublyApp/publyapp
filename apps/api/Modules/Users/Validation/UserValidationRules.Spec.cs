using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace PublyApp.Api.Modules.Users.Validation;

public sealed class UserValidationRulesSpec {
	private class UserStatusModel {
		public JsonElement? Status { get; set; }
	}

	private class UserStatusValidator
		: AbstractValidator<UserStatusModel> {
		public UserStatusValidator() {
			this.RuleFor(x => x.Status)
				.MustBeNullableUserStatus();
		}
	}

	// ============== MustBeNullableUserStatus ==============

	[Theory]
	[InlineData("suspended")]
	[InlineData("active")]
	public void ItShouldPassUserStatusWhenValid(
		string value
	) {
		var el = JsonSerializer.SerializeToElement(value);
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenInvalidString() {
		var el = JsonSerializer
			.SerializeToElement("unknown");
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenInactiveString() {
		var el = JsonSerializer
			.SerializeToElement("inactive");
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenDeletedString() {
		var el = JsonSerializer
			.SerializeToElement("deleted");
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassUserStatusWhenNull() {
		var model = new UserStatusModel {
			Status = null,
		};
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenJsonNull() {
		var model = new UserStatusModel {
			Status = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenWrongType() {
		var el = JsonSerializer.SerializeToElement(true);
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
