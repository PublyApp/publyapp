using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class ResolveStaffRoleUserAssignmentsBody {
	public JsonElement UserIds { get; init; }

	private bool _Parsed;
	private List<Guid> _UserIds = [];

	private List<Guid> _ParseUserIds() {
		if (this.UserIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("UserIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in this.UserIds.EnumerateArray()) {
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
		if (this._Parsed) {
			return this._UserIds;
		}

		this._UserIds = this._ParseUserIds();
		this._Parsed = true;
		return this._UserIds;
	}
}

public sealed class ResolveStaffRoleUserAssignmentsBodyValidator
	: AbstractValidator<ResolveStaffRoleUserAssignmentsBody> {
	private const int _MaxUserIds = 200;

	public ResolveStaffRoleUserAssignmentsBodyValidator() {
		this.RuleFor(x => x.UserIds)
			.Custom((element, context) => {
				if (element.ValueKind
					is JsonValueKind.Undefined
					or JsonValueKind.Null) {
					context.AddFailure("UserIds is required");
					return;
				}

				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("UserIds must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				if (array.Count > ResolveStaffRoleUserAssignmentsBodyValidator._MaxUserIds) {
					context.AddFailure(
						"userIds",
						$"At most {ResolveStaffRoleUserAssignmentsBodyValidator._MaxUserIds} userIds are supported per request"
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

public sealed class ResolveStaffRoleUserAssignmentsItem {
	public required Guid UserId { get; init; }
	public required bool IsAssigned { get; init; }
}

public sealed class ResolveStaffRoleUserAssignmentsResult {
	public required List<ResolveStaffRoleUserAssignmentsItem> Assignments { get; init; }
}

public sealed class ResolveStaffRoleUserAssignments {
	public static async Task<
		Results<
			Ok<ResolveStaffRoleUserAssignmentsResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[FromBody] ResolveStaffRoleUserAssignmentsBody body,
		[FromServices] IStaffRoleUserAssignmentAsStaffService staffRoleUserAssignmentAsStaffService,
		ILogger<ResolveStaffRoleUserAssignments> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid role id: {@LogData}",
					new { RoleId = roleId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		var args = new ResolveStaffRoleUserAssignmentsArgs(
			RoleId: roleIdGuid,
			UserIds: body.GetUserIds()
		);

		var serviceResult = await staffRoleUserAssignmentAsStaffService.ResolveStaffRoleUserAssignmentsAsync(
			args,
			cancellationToken
		);

		if (serviceResult is ResolveStaffRoleUserAssignmentsServiceResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (serviceResult is not ResolveStaffRoleUserAssignmentsServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled ResolveStaffRoleUserAssignmentsServiceResult type: "
				+ serviceResult.GetType().Name
			);
		}

		return TypedResults.Ok(new ResolveStaffRoleUserAssignmentsResult {
			Assignments = success.Assignments
				.Select(a => new ResolveStaffRoleUserAssignmentsItem {
					UserId = a.UserId,
					IsAssigned = a.IsAssigned,
				})
				.ToList(),
		});
	}
}
