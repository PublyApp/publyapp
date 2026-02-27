using System.Text.Json;

using FluentValidation;

using MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Modules.Users.Validation;

/// <summary>
/// User domain-specific validation rules for JsonElement fields.
/// These rules depend on UserAccount and User entities.
/// </summary>
public static class UserValidationRules {
	/// <summary>
	/// Validates a nullable JsonElement? account level field:
	/// null OK, otherwise must be valid account level string.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableAccountLevel<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				var kind = e.Value.ValueKind;
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.Value.GetString()
					?? string.Empty;
				return UserAccount
					.ParseAccountLevel(str) is not null;
			})
			.WithMessage(
				"AccountLevel must be a valid "
				+ "account level"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? status field
	/// for update/patch scenarios: null/Null OK,
	/// otherwise must parse via User.ParseStatus().
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableUserStatus<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				var kind = e.Value.ValueKind;
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.Value.GetString()
					?? string.Empty;
				return User.ParseStatus(str) is not null;
			})
			.WithMessage(
				"Status must be a valid status"
			);
	}
}
