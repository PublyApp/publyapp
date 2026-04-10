using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserProfilesBody {
	public JsonElement ProfileIds { get; init; }

	private bool _parsed;
	private List<Guid> _profileIds = [];

	private List<Guid> ParseProfileIds() {
		if (ProfileIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("ProfileIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in ProfileIds.EnumerateArray()) {
			var str = e.GetString();
			if (str is null) {
				// Post-validation invariant: the endpoint uses FluentValidation to ensure every
				// `profileIds[i]` is a non-empty UUID string before parsing. If this trips, it
				// means validation was bypassed or the validator/parsing logic got out of sync.
				throw new InvalidOperationException(
					"ProfileId is null after validation"
				);
			}
			ids.Add(Guid.Parse(str));
		}

		return ids;
	}

	public List<Guid> GetProfileIds() {
		if (_parsed) return _profileIds;
		_profileIds = ParseProfileIds();
		_parsed = true;
		return _profileIds;
	}
}

public sealed class UpdateStaffUserProfilesBodyValidator
	: AbstractValidator<UpdateStaffUserProfilesBody> {
	public UpdateStaffUserProfilesBodyValidator() {
		RuleFor(x => x.ProfileIds)
			.NotNull()
			.WithMessage("ProfileIds is required")
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("ProfileIds must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					if (item.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"profileIds[{i}]",
							"ProfileId must be a string"
						);
						continue;
					}

					var str = item.GetString();
					if (string.IsNullOrWhiteSpace(str)) {
						context.AddFailure(
							$"profileIds[{i}]",
							"ProfileId is required"
						);
						continue;
					}

					if (!Guid.TryParse(str, out _)) {
						context.AddFailure(
							$"profileIds[{i}]",
							"ProfileId must be a valid UUID"
						);
					}
				}
			});
	}
}

public sealed class UpdateStaffUserProfilesResult {
	public required List<StaffUserProfileItem> AssignedProfiles { get; init; }
}

public class UpdateStaffUserProfiles {
	public static async Task<
		Results<
			Ok<UpdateStaffUserProfilesResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> HandleUpdateStaffUserProfiles(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserProfilesBody body,
		[FromServices] IUserService userService,
		ILogger<UpdateStaffUserProfiles> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid user id: {@LogData}",
					new { UserId = userId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var env = AppEnvironment.Instance;
		// Treat the payload as a set (replace-set semantics).
		// Duplicate IDs should not count toward MAX_PROFILES_PER_USER and should not cause
		// duplicate junction inserts.
		var profileIds = body.GetProfileIds().Distinct().ToList();

		if (profileIds.Count > env.MAX_PROFILES_PER_USER) {
			var errors = new Dictionary<string, string[]> {
				["profileIds"] = [
					$"Cannot assign more than {env.MAX_PROFILES_PER_USER} profiles"
				]
			};

			return TypedProblems.ValidationProblem(
				"Max profiles per user exceeded",
				ResponseKeys.MaxProfilesPerUserExceeded,
				errors
			);
		}

		var updateResult = await userService.UpdateStaffUserProfilesAsync(
			userIdGuid,
			profileIds,
			cancellationToken
		);

		if (updateResult is UpdateStaffUserProfilesServiceResult.UserNotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (updateResult is UpdateStaffUserProfilesServiceResult.ProfilesNotFound notFound) {
			var errors = notFound.ProfileIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Profile not found" }
			);

			return TypedProblems.ValidationProblem(
				"One or more profiles not found",
				ResponseKeys.NotFound,
				errors
			);
		}

		if (updateResult is UpdateStaffUserProfilesServiceResult.ProfilesNotStaffScope notStaffScope) {
			var errors = notStaffScope.ProfileIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Profile must be a staff profile" }
			);

			return TypedProblems.ValidationProblem(
				"One or more profiles are not staff profiles",
				ResponseKeys.ProfileNotStaffScope,
				errors
			);
		}

		if (updateResult is not UpdateStaffUserProfilesServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UpdateStaffUserProfilesServiceResult type: "
				+ updateResult.GetType().Name
			);
		}

		return TypedResults.Ok(new UpdateStaffUserProfilesResult {
			AssignedProfiles = success.AssignedProfiles
				.Select(p => new StaffUserProfileItem {
					Id = p.Id,
					Name = p.Name,
					Description = p.Description,
				})
				.ToList(),
		});
	}
}
