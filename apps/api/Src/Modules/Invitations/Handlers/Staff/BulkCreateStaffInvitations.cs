using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using Polly;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public record BulkCreateStaffInvitationsBody {
	public JsonElement Invitations { get; init; }
	// cached parsed invitations
	private List<BulkStaffInvitationItem> _invitations = new();
	private bool _invitationsParsed = false;

	private List<BulkStaffInvitationItem> ParseInvitations() {
		var invitations = new List<BulkStaffInvitationItem>();

		foreach (var item in Invitations.EnumerateArray()) {
			var email = item.GetProperty("email").GetString()!;
			var profileIds = item.GetProperty("profileIds")
				.EnumerateArray()
				.Select(e => Guid.Parse(e.GetString()!))
				.ToList();

			invitations.Add(new BulkStaffInvitationItem {
				Email = email,
				ProfileIds = profileIds
			});
		}

		return invitations;
	}

	public List<BulkStaffInvitationItem> GetInvitations() {
		if (_invitationsParsed) {
			return _invitations;
		}

		_invitations = ParseInvitations();
		_invitationsParsed = true;

		return _invitations;
	}
}

public record BulkStaffInvitationsCreated {
	public required int Created { get; init; }
}

public class BulkCreateStaffInvitationsBodyValidator
	: AbstractValidator<BulkCreateStaffInvitationsBody> {
	public BulkCreateStaffInvitationsBodyValidator() {
		RuleFor(x => x.Invitations)
			.NotNull()
			.WithMessage("Invitations is required")
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("Invitations must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();
				var maxSize = AppEnvironment.Instance.MAX_BULK_INVITATIONS_SIZE;

				if (array.Count == 0) {
					context.AddFailure("Invitations array cannot be empty");
					return;
				}

				if (array.Count > maxSize) {
					context.AddFailure(
						$"Invitations array cannot contain more than {maxSize} items"
					);
					return;
				}

				// Track emails for duplicate detection
				var emailOccurrences = new Dictionary<string, List<int>>(
					StringComparer.OrdinalIgnoreCase
				);

				// Validate each item
				for (var i = 0; i < array.Count; i++) {
					var item = array[i];
					var index = i;

					if (item.ValueKind != JsonValueKind.Object) {
						context.AddFailure(
							$"invitations[{index}]",
							$"Invitation at index {index} must be an object"
						);
						continue;
					}

					// Validate email
					if (!item.TryGetProperty("email", out var emailElement)) {
						context.AddFailure(
							$"invitations[{index}].email",
							"Email is required"
						);
					} else {
						if (emailElement.ValueKind != JsonValueKind.String) {
							context.AddFailure(
								$"invitations[{index}].email",
								"Email must be a string"
							);
						} else {
							var email = emailElement.GetString();
							if (string.IsNullOrWhiteSpace(email)) {
								context.AddFailure(
									$"invitations[{index}].email",
									"Email is required"
								);
							} else if (!BeValidEmail(email)) {
								context.AddFailure(
									$"invitations[{index}].email",
									"Invalid email format"
								);
							} else {
								// Track email occurrences for duplicate check
								if (!emailOccurrences.TryGetValue(email, out var indices)) {
									indices = new List<int>();
									emailOccurrences[email] = indices;
								}
								indices.Add(index);
							}
						}
					}

					// Validate profileIds
					if (!item.TryGetProperty("profileIds", out var profileIdsElement)) {
						context.AddFailure(
							$"invitations[{index}].profileIds",
							"ProfileIds is required"
						);
					} else {
						if (profileIdsElement.ValueKind != JsonValueKind.Array) {
							context.AddFailure(
								$"invitations[{index}].profileIds",
								"ProfileIds must be an array"
							);
						} else {
							var profileIdsArray = profileIdsElement.EnumerateArray().ToList();
							if (profileIdsArray.Count == 0) {
								context.AddFailure(
									$"invitations[{index}].profileIds",
									"At least one profile ID is required"
								);
							} else {
								for (var j = 0; j < profileIdsArray.Count; j++) {
									var profileIdElement = profileIdsArray[j];
									if (profileIdElement.ValueKind != JsonValueKind.String) {
										context.AddFailure(
											$"invitations[{index}].profileIds[{j}]",
											"ProfileId must be a string"
										);
									} else {
										var profileIdStr = profileIdElement.GetString();
										if (!Guid.TryParse(profileIdStr, out _)) {
											context.AddFailure(
												$"invitations[{index}].profileIds[{j}]",
												"ProfileId must be a valid GUID"
											);
										}
									}
								}
							}
						}
					}
				}

				// Check for duplicate emails after iterating through all items
				var duplicateEmails = emailOccurrences
					.Where(kvp => kvp.Value.Count > 1)
					.Select(kvp => kvp.Key)
					.ToList();

				if (duplicateEmails.Count > 0) {
					var emailList = string.Join(", ", duplicateEmails);
					context.AddFailure(
						"Invitations",
						$"Duplicate email(s) found: {emailList}"
					);
				}
			});
	}

	private static bool BeValidEmail(string email) {
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}
}

public static class BulkCreateStaffInvitations {
	public static async Task<Results<
		Ok<BulkStaffInvitationsCreated>,
		AppValidationProblemHttpResult,
		AppBadRequestHttpResult,
		AppInternalServerErrorHttpResult
	>> HandleBulkCreateStaffInvitations(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAccountService accountService,
		[FromServices] IEmailService emailService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILoggerFactory loggerFactory,
		[FromBody] BulkCreateStaffInvitationsBody body,
		CancellationToken cancellationToken = default
	) {
		var logger = loggerFactory.CreateLogger(nameof(BulkCreateStaffInvitations));
		var account = authContext.AccountStaff;

		// should never happen because handler must be set behind StaffAuthFilter
		if (account is null) {
			return TypedProblems.InternalServerError(
				"Internal server error",
				ResponseKeys.InternalServerError
			);
		}

		// Parse JsonElement into typed list
		var invitations = body.GetInvitations();

		// Extract all unique emails and profile IDs for batch validation
		var uniqueEmails = invitations.Select(i => i.Email).Distinct().ToList();
		var allProfileIds = invitations.SelectMany(i => i.ProfileIds).Distinct().ToList();

		// Check for scope conflicts - staff invitations can't target users with tenant/project accounts
		var conflictingEmails = await accountService.GetEmailsWithTenantOrProjectAccountsAsync(
			uniqueEmails,
			cancellationToken
		);

		if (conflictingEmails.Count > 0) {
			// Return structured 422 with errors keyed by email for better frontend handling
			// Include email in message so UI can display it even if it only shows values
			var errors = conflictingEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: User already has tenant or project accounts" }
			);
			return TypedProblems.ValidationProblem(
				"Staff and tenant/project accounts are mutually exclusive",
				ResponseKeys.UserHasTenantOrProjectAccounts,
				errors
			);
		}

		// Batch validate all emails (2 queries total, not N queries)
		var existingUserEmails = await invitationService.GetExistingUserEmailsAsync(
			uniqueEmails,
			cancellationToken
		);

		if (existingUserEmails.Count > 0) {
			var errors = existingUserEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: User already exists" }
			);
			return TypedProblems.ValidationProblem(
				"One or more users already exist",
				ResponseKeys.UserAlreadyExists,
				errors
			);
		}

		var existingInvitationEmails = await invitationService.GetPendingInvitationEmailsAsync(
			uniqueEmails,
			InvitationScope.Staff,
			cancellationToken
		);

		if (existingInvitationEmails.Count > 0) {
			var errors = existingInvitationEmails.ToDictionary(
				email => email,
				email => new[] { $"{email}: Pending invitation already exists" }
			);
			return TypedProblems.ValidationProblem(
				"One or more pending invitations exist",
				ResponseKeys.PendingInvitationExists,
				errors
			);
		}

		// Batch validate all profiles (1 query total, not N queries)
		var validProfileIds = await invitationService.ValidateStaffProfilesAsync(
			allProfileIds,
			cancellationToken
		);

		var missingProfileIds = allProfileIds.Except(validProfileIds).ToList();

		if (missingProfileIds.Count > 0) {
			var errors = missingProfileIds.ToDictionary(
				id => id.ToString(),
				id => new[] { $"{id}: Profile not found" }
			);
			return TypedProblems.ValidationProblem(
				"One or more profiles not found",
				ResponseKeys.NotFound,
				errors
			);
		}

		// Call the service to create invitations
		var invitationTokens = await invitationService.BulkCreateStaffInvitationsAsync(
			invitations,
			account.UserId,
			cancellationToken
		);

		// Send invitation emails (fire and forget - don't block response)
		_ = Task.Run(async () => {
			await SendInvitationEmailsAsync(
				emailService,
				logger,
				invitationTokens,
				cancellationToken
			);
		}, cancellationToken);

		// Audit logging
		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationCreated,
			null, // Bulk operation has no single target
			new { Count = invitationTokens.Count, Scope = "Staff" },
			cancellationToken
		);

		// Return success response
		return TypedResults.Ok(new BulkStaffInvitationsCreated {
			Created = invitationTokens.Count
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
		CancellationToken cancellationToken
	) {
		// Create context to pass logger/email info for retry logging
		var context = new Context {
			["logger"] = logger,
			["email"] = email
		};

		// Create policy with onRetry that uses context (policy creation is lightweight)
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
					await sendEmailAction();
				},
				context,
				cancellationToken
			);

			// Log success only after policy completes successfully
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
