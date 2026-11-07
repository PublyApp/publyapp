using System.Text.Json;

using FluentValidation;

using PublyApp.Api.Lib.Validation;

namespace PublyApp.Api.Modules.Users.Validation;

internal static class TenantInvitationValidationLimits {
	public const int MaxRolesPerInvitation = 100;
}

internal sealed class TenantInvitationRoleIdsValidator
	: AbstractValidator<JsonElement> {
	public TenantInvitationRoleIdsValidator() {
		this.RuleFor(element => element)
			.MustBeRequiredGuidArrayAllowingEmpty(
				fieldName: "RoleIds",
				itemName: "RoleId",
				maxCount: TenantInvitationValidationLimits
					.MaxRolesPerInvitation
			);
	}
}
