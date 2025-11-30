using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Modules.Shared.Infrastructure.Messaging.Email;
using MainApi.Src.Modules.Staff.AuditLog;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Polly;

namespace MainApi.Src.Modules.Staff.ProfileAsStaff.Handlers;

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
		RuleFor(x => x.Name)
			.Must(e => e.HasValue)
			.WithMessage("Name is required")
			.DependentRules(() => {
				RuleFor(x => x.Name)
					.Must(e => e!.Value.ValueKind == JsonValueKind.String)
					.WithMessage("Name must be a string")
					.Must(e => !string.IsNullOrWhiteSpace(e!.Value.GetString()))
					.WithMessage("Name cannot be empty")
					.Must(e => e!.Value.GetString()!.Trim().Length >= 2)
					.WithMessage("Name must be at least 2 characters long")
					.Must(e => e!.Value.GetString()!.Trim().Length <= 100)
					.WithMessage("Name must be at most 100 characters long");
			});

		RuleFor(x => x.Description)
			.Must(BeNullableString)
			.WithMessage("Description must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.Description)
					.Must(BeValidDescriptionLength)
					.WithMessage("Description must be at most 500 characters");
			});

		RuleFor(x => x.Permissions)
			.Must(e => e.HasValue)
			.WithMessage("Permissions is required")
			.DependentRules(() => {
				RuleFor(x => x.Permissions)
					.Must(e => e!.Value.ValueKind == JsonValueKind.Array)
					.WithMessage("Permissions must be an array")
					.DependentRules(() => {
						RuleFor(x => x.Permissions)
							.Must(BeValidPermissionsArray)
							.WithMessage("At least one permission is required");
					});
			});

		RuleFor(x => x.Emails)
			.Must(BeValidEmailList)
			.When(x => x.Emails.HasValue)
			.WithMessage("Emails must be a list of valid email addresses");
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

	private static bool BeValidPermissionsArray(JsonElement? element) {
		// This is called only when we know it's an array (from DependentRules)
		if (!element.HasValue) {
			return false;
		}

		try {
			var list = element.Value.Deserialize<List<string>>();

			// Must have at least one permission
			return list is not null && list.Count > 0;
		} catch {
			return false;
		}
	}

	[GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
	private static partial Regex EmailRegex();

	private static bool BeValidEmailList(JsonElement? element) {
		if (!element.HasValue) return true;
		try {
			var list = element.Value.Deserialize<List<string>>();

			if (list is null) return false;

			return list.All(email => EmailRegex().IsMatch(email));
		} catch {
			return false;
		}
	}
}

public static class CreateStaffProfile {
	public static async Task<Results<
		Ok<StaffProfileCreated>,
		BadRequest<ApiResponse>
	>> HandleCreateStaffProfile(
		[FromServices] IAuthContext authContext,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromServices] IEmailService emailService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILoggerFactory loggerFactory,
		[FromBody] CreateStaffProfileBody body,
		CancellationToken cancellationToken = default
	) {
		var logger = loggerFactory.CreateLogger(nameof(CreateStaffProfile));

		// Extract values after validation
		string name = body.GetName();
		string? description = body.GetDescription();
		List<string> permissions = body.GetPermissions();
		List<string> emails = body.GetEmails();

		// Get current user ID for audit logging and invitations
		var currentUserId = authContext.AccountStaff?.UserId
			?? throw new InvalidOperationException("User ID not found in auth context");

		// Create staff profile via service
		var result = await profileAsStaffService.CreateStaffProfileAsync(
			name,
			description,
			permissions,
			emails,
			currentUserId,
			cancellationToken
		);

		// Handle different result types
		if (result is CreateStaffProfileResult.ProfileNameExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"Profile name already exists",
					ResponseKeys.ProfileNameAlreadyExists
				)
			);
		}

		if (result is CreateStaffProfileResult.InvalidPermissions invalidPerms) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Invalid permission keys: {string.Join(", ", invalidPerms.InvalidKeys)}",
					ResponseKeys.BadRequest
				)
			);
		}

		if (result is CreateStaffProfileResult.DuplicateEmails duplicates) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Duplicate emails provided: {string.Join(", ", duplicates.Emails)}",
					ResponseKeys.BadRequest
				)
			);
		}

		if (result is CreateStaffProfileResult.UsersWithConflictingAccounts conflicts) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					$"Cannot assign staff profile to users with existing tenant/project accounts: {string.Join(", ", conflicts.Emails)}",
					ResponseKeys.BadRequest
				)
			);
		}

		if (result is CreateStaffProfileResult.NoPermissionsProvided) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"At least one permission is required",
					ResponseKeys.BadRequest
				)
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

		return TypedResults.BadRequest(
			ApiResponse.Create(
				"Failed to create staff profile",
				ResponseKeys.BadRequest
			)
		);
	}

	private static async Task<Ok<StaffProfileCreated>> HandleSuccessAsync(
		CreateStaffProfileResult.Success success,
		IEmailService emailService,
		IAuditLogService auditLogService,
		ILogger logger,
		Guid currentUserId,
		CancellationToken cancellationToken
	) {
		var profileId = success.Profile.GetRequiredId();

		// Send invitation emails to NEW users (fire and forget - don't block response)
		_ = Task.Run(async () => {
			await SendInvitationEmailsAsync(
				emailService,
				logger,
				success.InvitationTokens,
				cancellationToken
			);
		}, cancellationToken);

		// Send notification emails to EXISTING users (fire and forget)
		_ = Task.Run(async () => {
			await SendNotificationEmailsAsync(
				emailService,
				logger,
				success.EmailsToNotify,
				cancellationToken
			);
		}, cancellationToken);

		// Audit log - profile created
		await auditLogService.LogAsync(
			currentUserId,
			AuditActions.StaffProfileCreated,
			profileId,
			new {
				Name = success.Profile.Name,
				PermissionsCount = success.PermissionsAssigned,
				UsersAssigned = success.UsersAssigned,
				InvitationsSent = success.InvitationsSent
			},
			cancellationToken
		);

		return TypedResults.Ok(new StaffProfileCreated {
			ProfileId = profileId,
			Name = success.Profile.Name,
			Description = success.Profile.Description,
			PermissionsAssigned = success.PermissionsAssigned,
			UsersAssigned = success.UsersAssigned,
			InvitationsSent = success.InvitationsSent
		});
	}

	/// <summary>
	/// Sends invitation emails with controlled concurrency and retry logic.
	/// </summary>
	private static async Task SendInvitationEmailsAsync(
		IEmailService emailService,
		ILogger logger,
		List<(string Email, string Token)> invitationTokens,
		CancellationToken cancellationToken
	) {
		if (invitationTokens.Count == 0) return;

		const int maxConcurrency = 5;
		using var semaphore = new SemaphoreSlim(maxConcurrency);

		var tasks = invitationTokens.Select(async (invitation) => {
			await semaphore.WaitAsync(cancellationToken);
			try {
				await SendEmailWithRetryAsync(
					async () => {
						await emailService.SendInvitationToJoinStaffEmailAsync(
							invitation.Email,
							invitation.Token
						);
					},
					logger,
					invitation.Email,
					"invitation",
					cancellationToken
				);
			} finally {
				semaphore.Release();
			}
		});

		await Task.WhenAll(tasks);
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
		if (emails.Count == 0) return;

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
			logger.LogInformation(
				"Successfully sent {EmailType} email to {Email}",
				emailType,
				email
			);
		} catch (Exception ex) {
			logger.LogError(
				ex,
				"Failed to send {EmailType} email to {Email} after 3 attempts",
				emailType,
				email
			);
			// Don't rethrow - email failures shouldn't break the main operation
		}
	}
}
