using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Anonymous;

public record InvitationDetails {
	public required string Email { get; init; }
	public required string RoleName { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public sealed class GetInvitationDetails {
	public static async Task<Results<
		Ok<InvitationDetails>,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string token,
		[FromServices] IInvitationQueryService invitationQueryService,
		CancellationToken cancellationToken = default
	) {
		var invitation = await invitationQueryService.GetInvitationByTokenAsync(
			token,
			cancellationToken
		);

		if (invitation is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		// Get role names from junction table
		var names = invitation.InvitationRoles
			.Select(ip => ip.Role?.Name)
			.Where(n => !string.IsNullOrEmpty(n))
			.ToList();

		string? roleDisplayName = null;

		if (names.Count > 0) {
			roleDisplayName = string.Join(", ", names);
		}

		if (roleDisplayName is null) {
			return TypedProblems.NotFound("Role not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(new InvitationDetails {
			Email = invitation.Email,
			RoleName = roleDisplayName,
			ExpiresAt = invitation.ExpiresAt
		});
	}
}
