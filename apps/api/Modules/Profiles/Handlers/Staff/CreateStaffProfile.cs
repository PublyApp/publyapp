using System.Text.Json;
using System.Text.RegularExpressions;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using Polly;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public record CreateStaffProfileBody {
	public JsonElement? Name { get; init; }
	public JsonElement? Description { get; init; }
	public JsonElement? Permissions { get; init; }
	public JsonElement? Emails { get; init; }

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
		[FromServices] IEmailService emailService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<CreateStaffProfile> logger,
		CancellationToken cancellationToken = default
	) {
		// Extract values after validation
		string name = body.GetName();
		string? description = body.GetDescription();
		List<string> permissions = body.GetPermissions();
		List<string> emails = body.GetEmails();

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
			InvitedByUserId: currentUserId
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
				emailService,
				auditLogService,
				logger,
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
		IEmailService emailService,
		IAuditLogService auditLogService,
		ILogger logger,
		Guid currentUserId,
		CancellationToken cancellationToken
	) {
		var profileId = success.Profile.GetRequiredId();

		// Invitation emails for NEW users are no longer sent here: the service
		// layer now writes a durable InvitationEmailOutbox row in the same
		// transaction as the invitation, and InvitationEmailOutboxDispatcher
		// delivers it out-of-band — a request-scoped Task.Run had no durable
		// record, so an aborted request or process restart could silently lose
		// the invitation while this response still claimed it was sent
		// (round-6 API F4).

		// Send notification emails to EXISTING users (fire and forget)
		_ = Task.Run(async () => {
			await SendNotificationEmailsAsync(
				emailService,
				logger,
				success.EmailsToNotify,
				CancellationToken.None
			);
		}, CancellationToken.None);

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

	/// <summary>
	/// Sends notification emails with controlled concurrency and retry logic.
	/// </summary>
	private static async Task SendNotificationEmailsAsync(
		IEmailService emailService,
		ILogger logger,
		List<string> emails,
		CancellationToken cancellationToken
	) {
		if (emails.Count == 0) {
			return;
		}

		const int maxConcurrency = 5;
		using var semaphore = new SemaphoreSlim(maxConcurrency);

		var tasks = emails.Select(async (email) => {
			await semaphore.WaitAsync(cancellationToken);
			try {
				await SendEmailWithRetryAsync(
					async () => {
						await emailService.SendJoinedStaffNotificationEmailAsync(email);
					},
					logger,
					email,
					"notification",
					cancellationToken
				);
			} finally {
				semaphore.Release();
			}
		});

		await Task.WhenAll(tasks);
	}

	/// <summary>
	/// Sends an email with exponential backoff retry logic using Polly.
	/// Creates a retry policy per call with Context for per-call logging.
	/// Policy creation is lightweight, so this approach is acceptable for this use case.
	/// </summary>
	private static async Task SendEmailWithRetryAsync(
		Func<Task> sendEmailAction,
		ILogger logger,
		string email,
		string emailType,
		CancellationToken cancellationToken
	) {
		// Create context to pass logger/email info for retry logging
		var context = new Context {
			["logger"] = logger,
			["email"] = email,
			["emailType"] = emailType
		};

		// Create policy with onRetry that uses context (policy creation is lightweight)
		var retryPolicy = Policy
			.Handle<Exception>()
			.WaitAndRetryAsync(
				retryCount: 3,
				sleepDurationProvider: retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt - 1)),
				onRetry: (exception, timeSpan, retryCount, ctx) => {
					var log = (ILogger)ctx["logger"];
					var emailAddr = (string)ctx["email"];
					var type = (string)ctx["emailType"];

					if (log.IsEnabled(LogLevel.Warning)) {
						log.LogWarning(
							exception,
							"Failed to send {EmailType} email to {Email} (attempt {Attempt}/3), " +
							"retrying in {Delay}ms",
							type,
							emailAddr,
							retryCount,
							timeSpan.TotalMilliseconds
						);
					}
				}
			);

		try {
			await retryPolicy.ExecuteAsync(
				async (ctx, ct) => {
					await sendEmailAction();
				},
				context,
				cancellationToken
			);

			// Log success only after policy completes successfully
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Successfully sent {EmailType} email to {Email}",
					emailType,
					email
				);
			}
		} catch (Exception ex) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError(
					ex,
					"Failed to send {EmailType} email to {Email} after 3 attempts",
					emailType,
					email
				);
			}
			// Don't rethrow - email failures shouldn't break the main operation
		}
	}
}
