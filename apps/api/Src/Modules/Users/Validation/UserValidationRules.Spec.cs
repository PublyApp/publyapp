using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace MainApi.Src.Modules.Users.Validation;

public sealed class UserValidationRulesSpec {
	private class AccountLevelModel {
		public JsonElement? AccountLevel { get; set; }
	}

	private class UserStatusModel {
		public JsonElement? Status { get; set; }
	}

	private class AccountLevelValidator
		: AbstractValidator<AccountLevelModel> {
		public AccountLevelValidator() {
			RuleFor(x => x.AccountLevel)
				.MustBeNullableAccountLevel();
		}
	}

	private class UserStatusValidator
		: AbstractValidator<UserStatusModel> {
		public UserStatusValidator() {
			RuleFor(x => x.Status)
				.MustBeNullableUserStatus();
		}
	}

	// ============== MustBeNullableAccountLevel ==============

	[Theory]
	[InlineData("admin")]
	[InlineData("Admin")]
	[InlineData("user")]
	[InlineData("User")]
	public void ItShouldPassAccountLevelWhenValid(
		string value
	) {
		var el = JsonSerializer.SerializeToElement(value);
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailAccountLevelWhenInvalidString() {
		var el = JsonSerializer
			.SerializeToElement("superadmin");
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassAccountLevelWhenNull() {
		var model = new AccountLevelModel {
			AccountLevel = null,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassAccountLevelWhenJsonNull() {
		var model = new AccountLevelModel {
			AccountLevel = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailAccountLevelWhenWrongType() {
		var el = JsonSerializer.SerializeToElement(42);
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============== MustBeNullableUserStatus ==============

	[Theory]
	[InlineData("inactive")]
	[InlineData("pending")]
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
