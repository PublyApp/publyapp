using MainApi.Localization;
using MainApi.Src.Modules.Shared.Invitation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.Invitation.Handlers;

public record InvitationDetails {
	public required string Email { get; init; }
	public required string ProfileName { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public static class GetInvitationDetails {
	public static async Task<Results<
		Ok<InvitationDetails>,
		NotFound<ApiResponse>
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
			return TypedResults.NotFound(
				ApiResponse.Create("Invitation not found", ResponseKeys.NotFound)
			);
		}

		// Get profile names from junction table
		var names = invitation.InvitationProfiles
			.Select(ip => ip.Profile?.Name)
			.Where(n => !string.IsNullOrEmpty(n))
			.ToList();

		if (names.Count == 0) {
			return TypedResults.NotFound(
				ApiResponse.Create("Profile not found", ResponseKeys.NotFound)
			);
		}

		var profileNames = string.Join(", ", names);

		return TypedResults.Ok(new InvitationDetails {
			Email = invitation.Email,
			ProfileName = profileNames,
			ExpiresAt = invitation.ExpiresAt
		});
	}
}
