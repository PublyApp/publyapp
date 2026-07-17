using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class ResolveTenantProfileUserAssignmentsAsStaffBody {
	public JsonElement UserAccountIds { get; init; }

	private bool _parsed;
	private List<Guid> _userAccountIds = [];

	private List<Guid> ParseUserAccountIds() {
		if (UserAccountIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("UserAccountIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in UserAccountIds.EnumerateArray()) {
			var str = e.GetString();
			if (str is null) {
				// Post-validation invariant: the endpoint uses FluentValidation to ensure every
				// `userAccountIds[i]` is a non-empty UUID string before parsing. If this trips,
				// it means validation was bypassed or the validator/parsing logic got out of sync.
				throw new InvalidOperationException("UserAccountId is null after validation");
			}

			ids.Add(Guid.Parse(str));
		}

		return ids;
	}

	public List<Guid> GetUserAccountIds() {
		if (_parsed) {
			return _userAccountIds;
		}

		_userAccountIds = ParseUserAccountIds();
		_parsed = true;
		return _userAccountIds;
	}
}

public sealed class ResolveTenantProfileUserAssignmentsAsStaffBodyValidator
	: AbstractValidator<ResolveTenantProfileUserAssignmentsAsStaffBody> {
	private const int MaxUserAccountIds = 200;

	public ResolveTenantProfileUserAssignmentsAsStaffBodyValidator() {
		RuleFor(x => x.UserAccountIds)
			.Custom((element, context) => {
				if (element.ValueKind
					is JsonValueKind.Undefined
					or JsonValueKind.Null) {
					context.AddFailure("UserAccountIds is required");
					return;
				}

				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("UserAccountIds must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				if (array.Count > MaxUserAccountIds) {
					context.AddFailure(
						"userAccountIds",
						$"At most {MaxUserAccountIds} userAccountIds are supported per request"
					);
					return;
				}

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					if (item.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"userAccountIds[{i}]",
							"UserAccountId must be a string"
						);
						continue;
					}

					var str = item.GetString();
					if (string.IsNullOrWhiteSpace(str)) {
						context.AddFailure(
							$"userAccountIds[{i}]",
							"UserAccountId is required"
						);
						continue;
					}

					if (!Guid.TryParse(str, out _)) {
						context.AddFailure(
							$"userAccountIds[{i}]",
							"UserAccountId must be a valid UUID"
						);
					}
				}
			});
	}
}

public sealed class ResolveTenantProfileUserAssignmentsAsStaffItem {
	public required Guid UserAccountId { get; init; }
	public required bool IsAssigned { get; init; }
}

public sealed class ResolveTenantProfileUserAssignmentsAsStaffResult {
	public required List<ResolveTenantProfileUserAssignmentsAsStaffItem> Assignments { get; init; }
}

/// <summary>
/// Batch-resolves whether a set of tenant member accounts is assigned to a tenant profile.
/// Mirrors <c>ResolveStaffProfileUserAssignments</c> (the staff-profiles precedent) — POST with
/// a JSON body array, not a CSV query filter: the request is a set of ids answering a single
/// "is assigned" read, not a list-filter predicate, so the repo's CSV-query-filter convention
/// (for <c>[AsParameters]</c> GET query DTOs) does not apply here, exactly as it does not for
/// the staff-profiles precedent this mirrors. Keyed by <c>user_account_id</c> to match the
/// sibling assign/unassign endpoints on this route group.
/// </summary>
public sealed class ResolveTenantProfileUserAssignmentsAsStaff {
	public static async Task<
		Results<
			Ok<ResolveTenantProfileUserAssignmentsAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromBody] ResolveTenantProfileUserAssignmentsAsStaffBody body,
		[FromServices] ITenantProfileQueryAsStaffService tenantProfileQueryService,
		ILogger<ResolveTenantProfileUserAssignmentsAsStaff> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid tenant id: {@LogData}",
					new { TenantId = tenantId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

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

		var args = new ResolveTenantProfileUserAssignmentsArgs(
			TenantId: tenantIdGuid,
			ProfileId: profileIdGuid,
			UserAccountIds: body.GetUserAccountIds()
		);

		var serviceResult = await tenantProfileQueryService
			.ResolveTenantProfileUserAssignmentsAsync(
				args,
				cancellationToken
			);

		if (serviceResult is ResolveTenantProfileUserAssignmentsResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult
				is not ResolveTenantProfileUserAssignmentsResult.Success success
		) {
			throw new InvalidOperationException(
				"Unhandled ResolveTenantProfileUserAssignmentsResult type: "
				+ serviceResult.GetType().Name
			);
		}

		return TypedResults.Ok(new ResolveTenantProfileUserAssignmentsAsStaffResult {
			Assignments = success.Assignments
				.Select(a => new ResolveTenantProfileUserAssignmentsAsStaffItem {
					UserAccountId = a.UserAccountId,
					IsAssigned = a.IsAssigned,
				})
				.ToList(),
		});
	}
}
