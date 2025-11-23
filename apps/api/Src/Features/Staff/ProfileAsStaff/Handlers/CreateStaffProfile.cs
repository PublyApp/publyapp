using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.ProfileAsStaff.Handlers;

public record CreateStaffProfileBody {
	public required JsonElement Name { get; init; }
	public JsonElement? Description { get; init; }
}

public record StaffProfileCreated {
	public required Guid ProfileId { get; init; }
	public required string Name { get; init; }
	public required string? Description { get; init; }
}

public class CreateStaffProfileBodyValidator
	: AbstractValidator<CreateStaffProfileBody> {
	public CreateStaffProfileBodyValidator() {
		RuleFor(x => x.Name)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Name must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Name is required")
			.Must(e => e.GetString()!.Trim().Length >= 2)
			.WithMessage("Name must be at least 2 characters long")
			.Must(e => e.GetString()!.Trim().Length <= 100)
			.WithMessage("Name must be at most 100 characters long");

		RuleFor(x => x.Description)
			.Must(BeNullableString)
			.WithMessage("Description must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.Description)
					.Must(BeValidDescriptionLength)
					.WithMessage("Description must be at most 500 characters");
			});
	}

	private static bool BeNullableString(JsonElement? element) {
		if (element is null) {
			return true;
		}
		return element?.ValueKind == JsonValueKind.String
			|| element?.ValueKind == JsonValueKind.Null
			|| element?.ValueKind == JsonValueKind.Undefined;
	}

	private static bool BeValidDescriptionLength(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind != JsonValueKind.String) {
			return true;
		}

		var description = element.Value.GetString();
		if (string.IsNullOrWhiteSpace(description)) {
			return true;
		}

		return description.Trim().Length <= 500;
	}
}

public static class CreateStaffProfile {
	public static async Task<Results<
		Ok<StaffProfileCreated>,
		BadRequest<ApiResponse>
	>> HandleCreateStaffProfile(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromBody] CreateStaffProfileBody body,
		CancellationToken cancellationToken = default
	) {
		// Extract values after validation
		string name = body.Name.GetValueAsString();
		string? description = body.Description.GetValueAsStringOrNull();

		// Create staff profile via service
		var result = await profileAsStaffService.CreateStaffProfileAsync(
			name,
			description,
			cancellationToken
		);

		// Handle result
		if (result is CreateStaffProfileResult.ProfileNameExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"Profile name already exists",
					ResponseKeys.ProfileNameAlreadyExists
				)
			);
		}

		if (result is CreateStaffProfileResult.Success success) {
			return TypedResults.Ok(new StaffProfileCreated {
				ProfileId = success.Profile.GetRequiredId(),
				Name = success.Profile.Name,
				Description = success.Profile.Description
			});
		}

		// This should never happen, but handle it just in case
		return TypedResults.BadRequest(
			ApiResponse.Create(
				"Failed to create staff profile",
				ResponseKeys.BadRequest
			)
		);
	}
}
