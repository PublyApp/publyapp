using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public sealed class ResolveStaffProfileUserAssignmentsBody {
	public JsonElement UserIds { get; init; }

	private bool _parsed;
	private List<Guid> _userIds = [];

	private List<Guid> ParseUserIds() {
		if (UserIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("UserIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in UserIds.EnumerateArray()) {
			var str = e.GetString();
			if (str is null) {
				// Post-validation invariant: the endpoint uses FluentValidation to ensure every
				// `userIds[i]` is a non-empty UUID string before parsing. If this trips, it means
				// validation was bypassed or the validator/parsing logic got out of sync.
				throw new InvalidOperationException("UserId is null after validation");
			}

			ids.Add(Guid.Parse(str));
		}

		return ids;
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

public sealed class ResolveStaffProfileUserAssignmentsBodyValidator
	: AbstractValidator<ResolveStaffProfileUserAssignmentsBody> {
	private const int MaxUserIds = 200;

	public ResolveStaffProfileUserAssignmentsBodyValidator() {
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

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					if (item.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"userIds[{i}]",
							"UserId must be a string"
						);
						continue;
					}

					var str = item.GetString();
					if (string.IsNullOrWhiteSpace(str)) {
						context.AddFailure(
							$"userIds[{i}]",
							"UserId is required"
						);
						continue;
					}

					if (!Guid.TryParse(str, out _)) {
						context.AddFailure(
							$"userIds[{i}]",
							"UserId must be a valid UUID"
						);
					}
				}
			});
	}
}

public sealed class ResolveStaffProfileUserAssignmentsItem {
	public required Guid UserId { get; init; }
	public required bool IsAssigned { get; init; }
}

public sealed class ResolveStaffProfileUserAssignmentsResult {
	public required List<ResolveStaffProfileUserAssignmentsItem> Assignments { get; init; }
}

public sealed class ResolveStaffProfileUserAssignments {
	public static async Task<
		Results<
			Ok<ResolveStaffProfileUserAssignmentsResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> HandleResolveStaffProfileUserAssignments(
		[FromRoute] string profileId,
		[FromBody] ResolveStaffProfileUserAssignmentsBody body,
		[FromServices] IProfileAsStaffService profileService,
		ILogger<ResolveStaffProfileUserAssignments> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid profile id: {@LogData}",
					new { ProfileId = profileId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		var args = new ResolveStaffProfileUserAssignmentsArgs(
			ProfileId: profileIdGuid,
			UserIds: body.GetUserIds()
		);

		var serviceResult = await profileService.ResolveStaffProfileUserAssignmentsAsync(
			args,
			cancellationToken
		);

		if (serviceResult is ResolveStaffProfileUserAssignmentsServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (serviceResult is not ResolveStaffProfileUserAssignmentsServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled ResolveStaffProfileUserAssignmentsServiceResult type: "
				+ serviceResult.GetType().Name
			);
		}

		return TypedResults.Ok(new ResolveStaffProfileUserAssignmentsResult {
			Assignments = success.Assignments
				.Select(a => new ResolveStaffProfileUserAssignmentsItem {
					UserId = a.UserId,
					IsAssigned = a.IsAssigned,
				})
				.ToList(),
		});
	}
}
