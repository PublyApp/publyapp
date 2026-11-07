using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserRolesBody {
	public JsonElement RoleIds { get; init; }

	private bool _Parsed;
	private List<Guid> _RoleIds = [];

	private List<Guid> _ParseRoleIds() {
		if (this.RoleIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("RoleIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in this.RoleIds.EnumerateArray()) {
			var str = e.GetString();
			if (str is null) {
				// Post-validation invariant: the endpoint uses FluentValidation to ensure every
				// `roleIds[i]` is a non-empty UUID string before parsing. If this trips, it
				// means validation was bypassed or the validator/parsing logic got out of sync.
				throw new InvalidOperationException(
					"RoleId is null after validation"
				);
			}
			ids.Add(Guid.Parse(str));
		}

		return ids;
	}

	public List<Guid> GetRoleIds() {
		if (this._Parsed) {
			return this._RoleIds;
		}

		this._RoleIds = this._ParseRoleIds();
		this._Parsed = true;
		return this._RoleIds;
	}
}

public sealed class UpdateStaffUserRolesBodyValidator
	: AbstractValidator<UpdateStaffUserRolesBody> {
	public UpdateStaffUserRolesBodyValidator() {
		this.RuleFor(x => x.RoleIds)
			.Custom((element, context) => {
				if (element.ValueKind
					is JsonValueKind.Undefined
					or JsonValueKind.Null) {
					context.AddFailure("RoleIds is required");
					return;
				}

				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("RoleIds must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					if (item.ValueKind != JsonValueKind.String) {
						context.AddFailure(
							$"roleIds[{i}]",
							"RoleId must be a string"
						);
						continue;
					}

					var str = item.GetString();
					if (string.IsNullOrWhiteSpace(str)) {
						context.AddFailure(
							$"roleIds[{i}]",
							"RoleId is required"
						);
						continue;
					}

					if (!Guid.TryParse(str, out _)) {
						context.AddFailure(
							$"roleIds[{i}]",
							"RoleId must be a valid UUID"
						);
					}
				}
			});
	}
}

public sealed class UpdateStaffUserRolesResult {
	public required List<StaffUserRoleItem> AssignedRoles { get; init; }
}

public sealed class UpdateStaffUserRoles {
	public static async Task<
		Results<
			Ok<UpdateStaffUserRolesResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult,
			AppForbiddenHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserRolesBody body,
		[FromServices] IStaffUserRoleAssignmentService userService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
		ILogger<UpdateStaffUserRoles> logger,
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
		// Duplicate IDs should not count toward MAX_ROLES_PER_USER and should not cause
		// duplicate junction inserts.
		var roleIds = body.GetRoleIds().Distinct().ToList();

		if (roleIds.Count > env.MAX_ROLES_PER_USER) {
			var errors = new Dictionary<string, string[]> {
				["roleIds"] = [
					$"Cannot assign more than {env.MAX_ROLES_PER_USER} roles"
				]
			};

			return TypedProblems.ValidationProblem(
				"Max roles per user exceeded",
				ResponseKeys.MaxRolesPerUserExceeded,
				errors
			);
		}

		var actor = authContext.GetRequiredStaffAccount();
		if (!await roleAssignmentGuard.CanAssignRolesAsync(
			actor.UserId,
			roleIds,
			cancellationToken
		)) {
			return TypedProblems.Forbidden(
				"Only a full-access staff member can assign the full-access role",
				ResponseKeys.Forbidden
			);
		}

		var updateResult = await userService.UpdateStaffUserRolesAsync(
			userIdGuid,
			roleIds,
			cancellationToken
		);

		if (updateResult is UpdateStaffUserRolesServiceResult.UserNotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (updateResult is UpdateStaffUserRolesServiceResult.RolesNotFound notFound) {
			var errors = notFound.RoleIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Role not found" }
			);

			return TypedProblems.ValidationProblem(
				"One or more roles not found",
				ResponseKeys.NotFound,
				errors
			);
		}

		if (updateResult is UpdateStaffUserRolesServiceResult.RolesNotStaffScope notStaffScope) {
			var errors = notStaffScope.RoleIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Role must be a staff role" }
			);

			return TypedProblems.ValidationProblem(
				"One or more roles are not staff roles",
				ResponseKeys.RoleNotStaffScope,
				errors
			);
		}

		if (updateResult is UpdateStaffUserRolesServiceResult.LastFullAccessRoleRemoval) {
			return TypedProblems.BadRequest(
				"Cannot remove the last full-access staff role holder",
				ResponseKeys.CannotRemoveLastAdmin
			);
		}

		if (updateResult is not UpdateStaffUserRolesServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UpdateStaffUserRolesServiceResult type: "
				+ updateResult.GetType().Name
			);
		}

		return TypedResults.Ok(new UpdateStaffUserRolesResult {
			AssignedRoles = success.AssignedRoles
				.Select(p => new StaffUserRoleItem {
					Id = p.Id,
					Name = p.Name,
					Description = p.Description,
				})
				.ToList(),
		});
	}
}
