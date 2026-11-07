using System.Text.Json;

using FluentValidation;

using PublyApp.Api.Modules.Users.Entities;


namespace PublyApp.Api.Modules.Users.Validation;

/// <summary>
/// User domain-specific validation rules for JsonElement fields.
/// These rules depend on UserAccount and User entities.
/// </summary>
public static class UserValidationRules {
	// Mirrors the front role/identity forms' client-side caps:
	// firstName/lastName ≤ 128 (after trim), avatarUrl ≤ 1024.
	public const int FirstNameMaxLength = 128;
	public const int LastNameMaxLength = 128;
	public const int AvatarUrlMaxLength = 1024;

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
					return false;
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
