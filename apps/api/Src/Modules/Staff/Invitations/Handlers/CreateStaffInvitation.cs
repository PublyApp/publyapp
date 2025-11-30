using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Shared.Infrastructure.Messaging.Email;
using MainApi.Src.Modules.Shared.Invitations;
using MainApi.Src.Modules.Staff.Audit;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Polly;

namespace MainApi.Src.Modules.Staff.Invitations.Handlers;

public record CreateStaffInvitationBody {
	public required JsonElement Email { get; init; }
	public required JsonElement ProfileId { get; init; }
}

public record InvitationCreated {
	public required Guid InvitationId { get; init; }
	public required string Token { get; init; }
	public required DateTime ExpiresAt { get; init; }
}

public class CreateStaffInvitationBodyValidator : AbstractValidator<CreateStaffInvitationBody> {
	public CreateStaffInvitationBodyValidator() {
		RuleFor(x => x.Email)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Email must be a string")
			.Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Email is required")
			.Must(BeValidEmail)
			.WithMessage("Invalid email format");

		RuleFor(x => x.ProfileId)
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("ProfileId must be a string")
			.Must(BeValidGuid)
			.WithMessage("ProfileId must be a valid GUID");
	}

	private bool BeValidEmail(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) return false;
		var email = element.GetString();
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}

	private bool BeValidGuid(JsonElement element) {
		if (element.ValueKind != JsonValueKind.String) return false;
		return Guid.TryParse(element.GetString(), out _);
	}
}

public static class CreateStaffInvitation {
	public static async Task<Results<
		Ok<InvitationCreated>,
		BadRequest<ApiResponse>,
		JsonHttpResult<ApiResponse>
	>> HandleCreateStaffInvitation(
		[FromServices] IAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IEmailService emailService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILoggerFactory loggerFactory,
		[FromBody] CreateStaffInvitationBody request,
		CancellationToken cancellationToken = default
	) {
		var logger = loggerFactory.CreateLogger(nameof(CreateStaffInvitation));
		// Authorization check
		var account = authContext.AccountStaff;
		if (account is null
			|| account.Scope != AccountScope.Staff
			|| account.Level != AccountLevel.Admin) {
			return TypedResults.Json(
				ApiResponse.Create(
					"User does not have the necessary permissions",
					ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
				),
				statusCode: StatusCodes.Status403Forbidden
			);
		}

		// Extract values after validation
		var email = request.Email.GetString()!;
		var profileId = Guid.Parse(request.ProfileId.GetString()!);

		// Validate profile via service
		var profile = await invitationService.GetStaffProfileAsync(
			profileId,
			cancellationToken
		);
		if (profile is null) {
			return TypedResults.BadRequest(
				ApiResponse.Create("Profile not found", ResponseKeys.NotFound)
			);
		}

		// Check if user exists via service
		var userExists = await invitationService.UserExistsAsync(
			email,
			cancellationToken
		);
		if (userExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"User already exists",
					ResponseKeys.UserAlreadyExists
				)
			);
		}

		// Check for pending invitation via service
		var pendingExists = await invitationService.PendingInvitationExistsAsync(
			email,
			InvitationScope.Staff,
			cancellationToken
		);
		if (pendingExists) {
			return TypedResults.BadRequest(
				ApiResponse.Create(
					"Pending invitation exists",
					ResponseKeys.PendingInvitationExists
				)
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

		return TypedResults.Ok(new InvitationCreated {
			InvitationId = invitation.GetRequiredId(),
			Token = token,
			ExpiresAt = invitation.ExpiresAt
		});
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

					log.LogWarning(
						exception,
						"Failed to send invitation email to {Email} (attempt {Attempt}/3), " +
						"retrying in {Delay}ms",
						emailAddr,
						retryCount,
						timeSpan.TotalMilliseconds
					);
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

			logger.LogInformation(
				"Successfully sent invitation email to {Email}",
				email
			);
		} catch (Exception ex) {
			logger.LogError(
				ex,
				"Failed to send invitation email to {Email} after 3 attempts",
				email
			);
			// Don't rethrow - email failures shouldn't break the main operation
		}
	}
}
