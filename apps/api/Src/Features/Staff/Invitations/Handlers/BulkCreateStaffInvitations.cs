using System.Text.Json;
using FluentValidation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public record BulkCreateStaffInvitationsBody {
	public required JsonElement Invitations { get; init; }
}

public record BulkStaffInvitationsCreated {
	public required int Created { get; init; }
}

public class BulkCreateStaffInvitationsBodyValidator
	: AbstractValidator<BulkCreateStaffInvitationsBody> {
	public BulkCreateStaffInvitationsBodyValidator() {
		RuleFor(x => x.Invitations)
			.NotNull()
			.WithMessage("Invitations is required");
	}
}

public static class BulkCreateStaffInvitations {
	public static async Task<Results<
		Ok<BulkStaffInvitationsCreated>,
		BadRequest<ApiResponse>,
		JsonHttpResult<ApiResponse>
	>> HandleBulkCreateStaffInvitations(
		[FromBody] BulkCreateStaffInvitationsBody request,
		CancellationToken cancellationToken = default
	) {
		// Business logic will be implemented later.
		await Task.CompletedTask; // Placeholder until implementation
		throw new NotImplementedException(
			"Bulk staff invitations creation is not implemented yet."
		);
	}
}


