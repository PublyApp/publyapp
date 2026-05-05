using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Anonymous;

public record InvitationDetails {
	public required string Email { get; init; }
	public required string ProfileName { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public class GetInvitationDetails {
	public static async Task<Results<
		Ok<InvitationDetails>,
		AppNotFoundHttpResult
	>> HandleGetInvitationDetails(
		[FromRoute] string token,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		var invitation = await invitationService.GetInvitationByTokenAsync(
			token,
			cancellationToken
		);

		if (invitation is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		// Get profile names from junction table
		var names = invitation.InvitationProfiles
			.Select(ip => ip.Profile?.Name)
			.Where(n => !string.IsNullOrEmpty(n))
			.ToList();

		string? roleDisplayName = null;

		if (names.Count > 0) {
			roleDisplayName = string.Join(", ", names);
		}

		if (
			roleDisplayName is null
			&& invitation.Scope == InvitationScope.Tenant
		) {
			roleDisplayName = UserAccount.GetLevelDescription(
				invitation.AccountLevel ?? AccountLevel.User
			);
		}

		if (roleDisplayName is null) {
			return TypedProblems.NotFound("Profile not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(new InvitationDetails {
			Email = invitation.Email,
			ProfileName = roleDisplayName,
			ExpiresAt = invitation.ExpiresAt
		});
	}
}
