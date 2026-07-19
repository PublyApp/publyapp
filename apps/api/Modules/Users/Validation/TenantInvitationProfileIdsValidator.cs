using System.Text.Json;

using FluentValidation;

using PublyApp.Api.Lib.Validation;

namespace PublyApp.Api.Modules.Users.Validation;

internal static class TenantInvitationValidationLimits {
	public const int MaxProfilesPerInvitation = 100;
}

internal sealed class TenantInvitationProfileIdsValidator
	: AbstractValidator<JsonElement> {
	public TenantInvitationProfileIdsValidator() {
		RuleFor(element => element)
			.MustBeRequiredGuidArrayAllowingEmpty(
				fieldName: "ProfileIds",
				itemName: "ProfileId",
				maxCount: TenantInvitationValidationLimits
					.MaxProfilesPerInvitation
			);
	}
}
