using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public record StaffInvitationProfile {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}

public record StaffInvitationDetails {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public DateTime? RevokedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required string InvitedByName { get; init; }
	public required Guid InvitedByUserId { get; init; }
	public required List<StaffInvitationProfile> Profiles { get; init; }
}

public class GetStaffInvitation {
	public static async Task<Results<
		Ok<StaffInvitationDetails>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetStaffInvitation(
		[FromRoute] string invitationId,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(
			invitationId,
			out var invitationIdGuid
		)) {
			return TypedProblems.BadRequest(
				"Invalid invitation ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await invitationService
			.GetStaffInvitationDetailsAsync(
				invitationIdGuid,
				cancellationToken
			);

		if (result is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		// Derive status from invitation state
		var status = GetInvitationStatus(result);

		return TypedResults.Ok(new StaffInvitationDetails {
			Id = result.Id,
			Email = result.Email,
			Status = status,
			ExpiresAt = result.ExpiresAt,
			AcceptedAt = result.AcceptedAt,
			RevokedAt = result.RevokedAt,
			CreatedAt = result.CreatedAt,
			InvitedByName = result.InvitedByName,
			InvitedByUserId = result.InvitedByUserId,
			Profiles = result.Profiles.Select(p => new StaffInvitationProfile {
				Id = p.Id,
				Name = p.Name
			}).ToList()
		});
	}

	private static string GetInvitationStatus(StaffInvitationDetailsResult result) {
		if (result.IsAccepted) {
			return "accepted";
		}
		if (result.IsRevoked) {
			return "revoked";
		}
		if (result.ExpiresAt <= DateTime.UtcNow) {
			return "expired";
		}
		return "pending";
	}
}
