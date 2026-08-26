using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public record StaffInvitationProfile {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}

public record StaffInvitationDetails {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required InvitationEffectiveStatus Status { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public DateTime? RevokedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required string InvitedByName { get; init; }
	public required Guid InvitedByUserId { get; init; }
	public required List<StaffInvitationProfile> Profiles { get; init; }
}

public sealed class GetStaffInvitation {
	public static async Task<Results<
		Ok<StaffInvitationDetails>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string invitationId,
		[FromServices] IInvitationQueryService invitationQueryService,
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

		var result = await invitationQueryService
			.GetStaffInvitationDetailsAsync(
				invitationIdGuid,
				cancellationToken
			);

		if (result is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(new StaffInvitationDetails {
			Id = result.Id,
			Email = result.Email,
			Status = result.Status,
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
}
