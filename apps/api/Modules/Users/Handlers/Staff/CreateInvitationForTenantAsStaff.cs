using FluentValidation;

using System.Text.Json;

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
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record CreateInvitationForTenantAsStaffBody {
	// Do not mark JsonElement fields as C# required here: missing JSON properties must
	// reach FluentValidation so clients receive the repo-standard 422 validation problem.
	public JsonElement Email { get; init; }
	public JsonElement AccountLevel { get; init; }
}

public record InvitationCreatedForTenant {
	public required Guid InvitationId { get; init; }
	public DateTime ExpiresAt { get; init; }
}

public class CreateInvitationForTenantAsStaffBodyValidator
	: AbstractValidator<CreateInvitationForTenantAsStaffBody> {
	public CreateInvitationForTenantAsStaffBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.AccountLevel)
			.MustBeRequiredString("AccountLevel")
			.MustBeRequiredAccountLevel();
	}
}

public sealed class CreateInvitationForTenantAsStaff {
	public static async Task<Results<
		Created<InvitationCreatedForTenant>,
		AppBadRequestHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] CreateInvitationForTenantAsStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ITenantProfileAsStaffService tenantProfileService,
		[FromServices] ITenantService tenantService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CreateInvitationForTenantAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		// Validate tenantId
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		// Extract values after validation
		var email = body.Email.GetValueAsString();
		var accountLevelStr = body.AccountLevel.GetValueAsString();
		var parsedAccountLevel = UserAccount.ParseLevel(accountLevelStr);
		if (parsedAccountLevel is null) {
			throw new InvalidOperationException(
				$"AccountLevel '{accountLevelStr}' is invalid after validation"
			);
		}
		var accountLevel = parsedAccountLevel.Value;

		// Check if tenant exists (including suspended)
		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(tenantIdGuid, cancellationToken);
		if (tenant is null) {
			return TypedProblems.BadRequest(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		// Existing non-staff users can be invited to another tenant.
		// The only create-time blockers are staff-account exclusivity and
		// already being a member of the target tenant.
		var invitationTarget = await accountService.ResolveTenantInvitationTargetByEmailAsync(
			email,
			tenantIdGuid,
			cancellationToken
		);

		if (invitationTarget
			is ResolveTenantInvitationTargetByEmailResult.UserHasStaffAccount) {
			return TypedProblems.BadRequest(
				"This user already has a Staff account. Staff and Tenant accounts are mutually exclusive.",
				ResponseKeys.UserHasStaffAccount
			);
		}

		if (invitationTarget
			is ResolveTenantInvitationTargetByEmailResult.UserAlreadyMemberOfTenant) {
			return TypedProblems.BadRequest(
				"User is already member of tenant",
				ResponseKeys.UserAlreadyMemberOfTenant
			);
		}

		// Check for pending invitation for this tenant
		var pendingExists = await invitationService.PendingTenantInvitationExistsAsync(
			email,
			tenantIdGuid,
			cancellationToken
		);
		if (pendingExists) {
			return TypedProblems.BadRequest(
				"Pending invitation exists for this tenant",
				ResponseKeys.PendingInvitationExists
			);
		}

		// Get the staff user ID who is inviting
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		List<Guid> profileIds = [];
		if (accountLevel != AccountLevel.Admin) {
			var defaultProfile = await tenantProfileService.GetOrCreateDefaultTenantProfileAsync(
				tenantIdGuid,
				cancellationToken
			);

			profileIds = [defaultProfile.GetRequiredId()];
		}

		// Create the invitation
		var createArgs = new CreateTenantInvitationArgs(
			Email: email,
			TenantId: tenantIdGuid,
			ProfileIds: profileIds,
			InvitedByUserId: account.UserId
		);
		var (invitation, token) = await invitationService.CreateTenantInvitationAsync(
			createArgs,
			cancellationToken
		);
		var createdInvitation = invitation;

		// Store account level on the invitation
		createdInvitation.AccountLevel = accountLevel;

		// Keep tenant invitations consistent with staff invitations:
		// fire-and-forget the email so API success is not blocked by provider latency.
		_ = Task.Run(async () => {
			await SendInvitationEmailWithRetryAsync(
				emailService,
				logger,
				email,
				tenant.Name,
				token,
				accountLevel
			);
		}, cancellationToken);

		// Audit log
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationCreated,
				TargetId: createdInvitation.GetRequiredId(),
				Details: new {
					Email = email,
					TenantId = tenantIdGuid,
					AccountLevel = accountLevelStr,
					Scope = "Tenant"
				}
			),
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new InvitationCreatedForTenant {
				InvitationId = createdInvitation.GetRequiredId(),
				ExpiresAt = createdInvitation.ExpiresAt
			}
		);
	}

	private static async Task SendInvitationEmailWithRetryAsync(
		IEmailService emailService,
		ILogger logger,
		string email,
		string tenantName,
		string token,
		AccountLevel accountLevel
	) {
		var context = new Context {
			["logger"] = logger,
			["email"] = email
		};

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
							"Failed to send tenant invitation email to {Email} (attempt {Attempt}/3), " +
							"retrying in {Delay}ms",
							emailAddr,
							retryCount,
							timeSpan.TotalMilliseconds
						);
					}
				}
			);

		try {
			await retryPolicy.ExecuteAsync(async () => {
				await emailService.SendTenantInvitationEmailAsync(
					email,
					tenantName,
					token,
					accountLevel
				);
			});
		} catch (Exception ex) {
			logger.LogError(
				ex,
				"Failed to send tenant invitation email to {Email} after 3 attempts",
				email
			);
		}
	}
}
