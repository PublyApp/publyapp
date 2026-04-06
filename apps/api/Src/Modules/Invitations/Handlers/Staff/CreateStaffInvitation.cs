using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using Polly;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public record CreateStaffInvitationBody {
	public required JsonElement Email { get; init; }
	public required JsonElement ProfileId { get; init; }
}

public record InvitationCreated {
	public required Guid InvitationId { get; init; }
	public required string Token { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public class CreateStaffInvitationBodyValidator
	: AbstractValidator<CreateStaffInvitationBody> {
	public CreateStaffInvitationBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.ProfileId)
			.MustBeRequiredString("ProfileId")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				return Guid.TryParse(
					e.GetString(), out _
				);
			})
			.WithMessage(
				"ProfileId must be a valid GUID"
			);
	}
}

public class CreateStaffInvitation {
	public static async Task<Results<
		Created<InvitationCreated>,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> HandleCreateStaffInvitation(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IEmailService emailService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<CreateStaffInvitation> logger,
		[FromBody] CreateStaffInvitationBody body,
		CancellationToken cancellationToken = default
	) {
		// IMPOSSIBLE STATE: Staff endpoint without staff account
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Extract values after validation
		var email = body.Email.GetValueAsString();
		var profileId = Guid.Parse(body.ProfileId.GetValueAsString());

		// Validate profile via service
		var profile = await invitationService.GetStaffProfileAsync(
			profileId,
			cancellationToken
		);
		if (profile is null) {
			return TypedProblems.BadRequest("Profile not found", ResponseKeys.NotFound);
		}

		// Check if user exists first - this determines whether we need to check for account conflicts
		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);
		if (userExists) {
			// User exists - check for scope conflicts (more specific error)
			// Only query accounts if user exists (saves a query for new-email invites)
			var hasTenantOrProjectAccounts = await accountService.HasTenantOrProjectAccountsByEmailAsync(
				email,
				cancellationToken
			);
			if (hasTenantOrProjectAccounts) {
				return TypedProblems.BadRequest(
					"This user already has tenant or project accounts. Staff and tenant/project accounts are mutually exclusive.",
					ResponseKeys.UserHasTenantOrProjectAccounts
				);
			}

			// User exists but no conflicts - still can't invite existing users
			return TypedProblems.BadRequest(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			);
		}

		// Check for pending invitation via service
		var pendingExists = await invitationService.PendingInvitationExistsAsync(
			email,
			InvitationScope.Staff,
			cancellationToken
		);
		if (pendingExists) {
			return TypedProblems.BadRequest(
				"Pending invitation exists",
				ResponseKeys.PendingInvitationExists
			);
		}

		// Create invitation via service (wrap single profileId in list for new API)
		var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
			email,
			new List<Guid> { profileId },
			account.UserId,
			cancellationToken
		);

		// Send invitation email (fire and forget - don't block response)
		_ = Task.Run(async () => {
			await SendInvitationEmailWithRetryAsync(
				emailService,
				logger,
				email,
				token,
				cancellationToken
			);
		}, cancellationToken);

		// Audit log
		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationCreated,
			invitation.GetRequiredId(),
			new { Email = email, ProfileId = profileId, Scope = "Staff" },
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new InvitationCreated {
				InvitationId = invitation
					.GetRequiredId(),
				Token = token,
				ExpiresAt = invitation.ExpiresAt
			}
		);
	}

	/// <summary>
	/// Sends an invitation email with exponential backoff retry logic using Polly.
	/// </summary>
	private static async Task SendInvitationEmailWithRetryAsync(
		IEmailService emailService,
		ILogger logger,
		string email,
		string token,
		CancellationToken cancellationToken
	) {
		// Create context to pass logger/email info for retry logging
		var context = new Context {
			["logger"] = logger,
			["email"] = email
		};

		// Create policy with onRetry that uses context
		var retryPolicy = Policy
			.Handle<Exception>()
			.WaitAndRetryAsync(
				retryCount: 3,
				sleepDurationProvider: retryAttempt =>
					TimeSpan.FromSeconds(Math.Pow(2, retryAttempt - 1)),
				onRetry: (exception, timeSpan, retryCount, ctx) => {
					var log = (ILogger)ctx["logger"];
					var emailAddr = (string)ctx["email"];

					if (log.IsEnabled(LogLevel.Warning)) {
						log.LogWarning(
							exception,
							"Failed to send invitation email to {Email} (attempt {Attempt}/3), " +
							"retrying in {Delay}ms",
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
					await emailService.SendInvitationToJoinStaffEmailAsync(email, token);
				},
				context,
				cancellationToken
			);

			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Successfully sent invitation email to {Email}",
					email
				);
			}
		} catch (Exception ex) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError(
					ex,
					"Failed to send invitation email to {Email} after 3 attempts",
					email
				);
			}
			// Don't rethrow - email failures shouldn't break the main operation
		}
	}
}
