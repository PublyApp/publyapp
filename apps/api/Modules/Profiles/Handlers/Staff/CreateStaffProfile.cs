using System.Text.Json;
using System.Text.RegularExpressions;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Profiles.Validation;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public record CreateStaffProfileBody {
	public JsonElement? Name { get; init; }
	public JsonElement? Description { get; init; }
	public JsonElement? Permissions { get; init; }
	public JsonElement? Emails { get; init; }
	public JsonElement Icon { get; init; }
	public JsonElement Tone { get; init; }

	public string GetName() {
		if (!Name.HasValue) {
			throw new InvalidOperationException("Name is required");
		}
		return Name.Value.GetValueAsString();
	}

	public string? GetDescription() {
		return Description.GetValueAsStringOrNull();
	}

	public List<string> GetPermissions() {
		if (!Permissions.HasValue) {
			return [];
		}

		return Permissions.Value.Deserialize<List<string>>() ?? [];
	}

	public List<string> GetEmails() {
		if (!Emails.HasValue) {
			return [];
		}

		return Emails.Value.Deserialize<List<string>>() ?? [];
	}

	public string? GetIcon() {
		return Icon.GetValueAsStringOrNull();
	}

	public string? GetTone() {
		return Tone.GetValueAsStringOrNull();
	}
}

public record StaffProfileCreated {
	public required Guid ProfileId { get; init; }
	public required string Name { get; init; }
	public required string? Description { get; init; }
	public required int PermissionsAssigned { get; init; }
	public required int UsersAssigned { get; init; }
	public required int InvitationsSent { get; init; }
}

public partial class CreateStaffProfileBodyValidator
	: AbstractValidator<CreateStaffProfileBody> {
	public CreateStaffProfileBodyValidator() {
		RuleFor(x => x.Name).Custom((maybeElement, context) => {
			if (!maybeElement.HasValue) {
				context.AddFailure("Name is required");
				return;
			}
			var e = maybeElement.Value;
			if (e.ValueKind != JsonValueKind.String) {
				context.AddFailure("Name must be a string");
				return;
			}
			var str = e.GetString();
			if (string.IsNullOrWhiteSpace(str)) {
				context.AddFailure("Name cannot be empty");
				return;
			}
			if (str.Trim().Length < 2) {
				context.AddFailure("Name must be at least 2 characters long");
				return;
			}
			if (str.Trim().Length > 100) {
				context.AddFailure("Name must be at most 100 characters long");
			}
		});

		RuleFor(x => x.Description)
			.MustBeNullableStringWithMaxLength("Description", 500, trim: true);

		RuleFor(x => x.Permissions).Custom((maybeElement, context) => {
			if (!maybeElement.HasValue) {
				context.AddFailure("Permissions is required");
				return;
			}
			var e = maybeElement.Value;
			if (e.ValueKind != JsonValueKind.Array) {
				context.AddFailure("Permissions must be an array");
				return;
			}
			try {
				var list = e.Deserialize<List<string>>();
				if (list is null || list.Count == 0) {
					context.AddFailure("At least one permission is required");
				}
			} catch {
				context.AddFailure("At least one permission is required");
			}
		});

		RuleFor(x => x.Emails).Custom((maybeElement, context) => {
			if (!maybeElement.HasValue) {
				return;
			}
			try {
				var list = maybeElement.Value.Deserialize<List<string>>();
				if (list is null) {
					context.AddFailure("Emails must be a list of valid email addresses");
					return;
				}
				var maxSize = AppEnvironment.Instance
					.MAX_BULK_INVITATIONS_SIZE;
				if (list.Count > maxSize) {
					context.AddFailure(
						$"Emails cannot contain more "
							+ $"than {maxSize} items"
					);
					return;
				}
				if (!list.All(email => EmailRegex().IsMatch(email))) {
					context.AddFailure("Emails must be a list of valid email addresses");
				}
			} catch {
				context.AddFailure("Emails must be a list of valid email addresses");
			}
		});

		RuleFor(x => x.Icon)
			.MustBePatchFieldStringInSet(
				"Icon",
				ProfileStyleValidationRules.Icons
			);

		RuleFor(x => x.Tone)
			.MustBePatchFieldStringInSet(
				"Tone",
				ProfileStyleValidationRules.Tones
			);
	}

	[GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
	private static partial Regex EmailRegex();
}

public sealed class CreateStaffProfile {
	public static async Task<Results<
		Created<StaffProfileCreated>,
		AppBadRequestHttpResult
	>> Handle(
		[FromBody] CreateStaffProfileBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IStaffProfileAsStaffService profileAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// Extract values after validation
		string name = body.GetName();
		string? description = body.GetDescription();
		List<string> permissions = body.GetPermissions();
		List<string> emails = body.GetEmails();
		string? icon = body.GetIcon();
		string? tone = body.GetTone();

		// Get current user ID for audit logging and invitations
		if (authContext.AccountStaff is null) {
			throw new InvalidOperationException(
				"User ID not found in auth context"
			);
		}
		var currentUserId = authContext.AccountStaff.UserId;

		// Create staff profile via service
		var args = new CreateStaffProfileArgs(
			Name: name,
			Description: description,
				Permissions: permissions,
				Emails: emails,
				InvitedByUserId: currentUserId,
				Icon: icon,
				Tone: tone
		);
		var result = await profileAsStaffService.CreateStaffProfileAsync(
			args,
			cancellationToken
		);

		// Handle different result types
		if (result is CreateStaffProfileResult.ProfileNameExists) {
			return TypedProblems.BadRequest(
				"Profile name already exists",
				ResponseKeys.ProfileNameAlreadyExists
			);
		}

		if (result is CreateStaffProfileResult.InvalidPermissions invalidPerms) {
			return TypedProblems.BadRequest(
				$"Invalid permission keys: {string.Join(", ", invalidPerms.InvalidKeys)}",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateStaffProfileResult.DuplicateEmails duplicates) {
			return TypedProblems.BadRequest(
				$"Duplicate emails provided: {string.Join(", ", duplicates.Emails)}",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateStaffProfileResult.UsersWithConflictingAccounts conflicts) {
			return TypedProblems.BadRequest(
				$"Cannot assign staff profile to users with existing tenant/project accounts: {string.Join(", ", conflicts.Emails)}",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateStaffProfileResult.NoPermissionsProvided) {
			return TypedProblems.BadRequest(
				"At least one permission is required",
				ResponseKeys.BadRequest
			);
		}

		if (result is CreateStaffProfileResult.Success success) {
			return await HandleSuccessAsync(
				success,
				auditLogService,
				currentUserId,
				cancellationToken
			);
		}

		return TypedProblems.BadRequest(
			"Failed to create staff profile",
			ResponseKeys.BadRequest
		);
	}

	private static async Task<Created<StaffProfileCreated>> HandleSuccessAsync(
		CreateStaffProfileResult.Success success,
		IAuditLogService auditLogService,
		Guid currentUserId,
		CancellationToken cancellationToken
	) {
		var profileId = success.Profile.GetRequiredId();

		// No email work happens here at all (#291): the NEW-user invitations ride the
		// durable InvitationEmailOutbox written by the service in its transaction
		// (round-6 API F4), and the EXISTING-user "you have been added as a staff
		// member" notifications ride durable email.staff-joined-notification.v1 jobs
		// the service enqueues in that SAME transaction. This handler previously
		// fire-and-forget the latter via a request-scoped Task.Run with no durable
		// record — an aborted request or process restart silently lost them while the
		// 201 response still claimed the assignment succeeded.

		// Audit log - profile created
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: currentUserId,
				Action: AuditActions.StaffProfileCreated,
				TargetId: profileId,
				Details: new {
					Name = success.Profile.Name,
					PermissionsCount = success.PermissionsAssigned,
					UsersAssigned = success.UsersAssigned,
					InvitationsSent = success.InvitationsSent
				}
			),
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new StaffProfileCreated {
				ProfileId = profileId,
				Name = success.Profile.Name,
				Description = success.Profile
					.Description,
				PermissionsAssigned = success
					.PermissionsAssigned,
				UsersAssigned = success
					.UsersAssigned,
				InvitationsSent = success
					.InvitationsSent
			}
		);
	}
}
