using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public sealed class UnassignStaffProfileUsersBody {
	public JsonElement UserIds { get; init; }

	private bool _parsed;
	private List<Guid> _userIds = [];

	private List<Guid> ParseUserIds() {
		if (UserIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("UserIds must be an array");
		}

		// Validator guarantees each item is a UUID string, so parsing stays aligned with the
		// repo-wide `TryGetGuid`/`GetGuid` pattern used by other bulk-UUID endpoints.
		return UserIds.EnumerateArray()
			.Select(item => item.GetGuid())
			.ToList();
	}

	public List<Guid> GetUserIds() {
		if (_parsed) {
			return _userIds;
		}

		_userIds = ParseUserIds();
		_parsed = true;
		return _userIds;
	}
}

public sealed class UnassignStaffProfileUsersBodyValidator
	: AbstractValidator<UnassignStaffProfileUsersBody> {
	private const int MaxUserIds = 200;

	public UnassignStaffProfileUsersBodyValidator() {
		RuleFor(x => x.UserIds)
			.NotNull()
			.WithMessage("UserIds is required")
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("UserIds must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				if (array.Count > MaxUserIds) {
					context.AddFailure(
						"userIds",
						$"At most {MaxUserIds} userIds are supported per request"
					);
					return;
				}

				var index = 0;
				foreach (var item in array) {
					if (item.ValueKind != JsonValueKind.String) {
						context.AddFailure($"userIds[{index}]", "UserId must be a string");
						index++;
						continue;
					}

					var str = item.GetString();
					if (string.IsNullOrWhiteSpace(str)) {
						context.AddFailure($"userIds[{index}]", "UserId is required");
						index++;
						continue;
					}

					if (!item.TryGetGuid(out _)) {
						context.AddFailure($"userIds[{index}]", "UserId must be a valid UUID");
					}

					index++;
				}
			});
	}
}

public sealed class UnassignStaffProfileUsers {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> HandleUnassignStaffProfileUsers(
		[FromRoute] string profileId,
		[FromBody] UnassignStaffProfileUsersBody body,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest("Invalid profileId", ResponseKeys.MalformedId);
		}

		// Collapse duplicates up front so bulk actions stay idempotent and the service
		// does not waste work on repeated user IDs from the UI selection model.
		var userIds = body.GetUserIds().Distinct().ToList();
		if (userIds.Count == 0) {
			return TypedResults.Ok(
				ApiResponse.Create(
					"No users to unassign",
					ResponseKeys.StaffProfileUsersUnassignedSuccess
				)
			);
		}

		var result = await profileAsStaffService.UnassignStaffProfileUsersAsync(
			new UnassignStaffProfileUsersArgs(ProfileId: profileIdGuid, UserIds: userIds),
			cancellationToken
		);

		if (result is UnassignStaffProfileUsersServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound("Profile not found", ResponseKeys.NotFound);
		}

		if (result is not UnassignStaffProfileUsersServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UnassignStaffProfileUsersServiceResult type: "
				+ result.GetType().Name
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				$"Unassigned {success.UnassignedCount} user(s)",
				ResponseKeys.StaffProfileUsersUnassignedSuccess
			)
		);
	}
}
