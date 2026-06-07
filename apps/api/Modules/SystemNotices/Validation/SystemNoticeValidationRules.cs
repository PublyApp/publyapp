using System.Text.Json;

using FluentValidation;

using PublyApp.Api.Modules.SystemNotices.Entities;

namespace PublyApp.Api.Modules.SystemNotices.Validation;

/// <summary>
/// System notice domain-specific validation rules for JsonElement fields.
/// These rules depend on the <see cref="SystemNotice"/> entity (severity parsing),
/// so they live in the module's Validation folder rather than Lib/Validation —
/// see docs/guides/validator-conventions.md.
/// </summary>
public static class SystemNoticeValidationRules {
	private const string SeverityMessage =
		"Severity must be one of: info, warning, critical";

	/// <summary>
	/// Validates a required JsonElement severity field:
	/// must be a string and parse via <see cref="SystemNotice.ParseSeverity"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredSeverity<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
	) {
		return ruleBuilder
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Severity must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var value = e.GetString();
				if (value is null) {
					return false;
				}
				return SystemNotice.ParseSeverity(value) is not null;
			})
			.WithMessage(SeverityMessage);
	}

	/// <summary>
	/// Validates a nullable JsonElement? severity field for update/patch scenarios:
	/// wrapper-null or JSON null OK; otherwise must be a string that parses via
	/// <see cref="SystemNotice.ParseSeverity"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableSeverity<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder
	) {
		return ruleBuilder
			.Must(e => {
				if (e is null
					|| e.Value.ValueKind == JsonValueKind.Null) {
					return true;
				}
				return e.Value.ValueKind == JsonValueKind.String;
			})
			.WithMessage("Severity must be a string or null")
			.Must(e => {
				if (e is null
					|| e.Value.ValueKind == JsonValueKind.Null) {
					return true;
				}
				if (e.Value.ValueKind != JsonValueKind.String) {
					return false;
				}
				var value = e.Value.GetString();
				if (value is null) {
					return false;
				}
				return SystemNotice.ParseSeverity(value) is not null;
			})
			.WithMessage(SeverityMessage);
	}
}
