using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

using Polly;

namespace MainApi.Src.Modules.Staff.TenantsAsStaff.Handlers;

public class CreateTenantAsStaffBody {
	public JsonElement Name { get; set; }
	public JsonElement MaxUsers { get; set; }
	public JsonElement InitialUsers { get; set; }

	public string GetName() {
		return Name.GetValueAsString();
	}

	// NEW: Parse MaxUsers using extension method (nullable - defaults to DEFAULT_MAX_USERS_PER_TENANT)
	public int? GetMaxUsers() {
		return MaxUsers.GetValueAsInt32OrNull();
	}

	// NEW: Parse InitialUsers
	public record InitialUserItem(string Email, string AccountLevel);

	public List<InitialUserItem> GetInitialUsers() {
		if (InitialUsers.ValueKind != JsonValueKind.Array) {
			throw new Exception("InitialUsers must be an array");
		}

		var users = new List<InitialUserItem>();
		foreach (var item in InitialUsers.EnumerateArray()) {
			var email = item.GetProperty("email").GetValueAsString();
			var accountLevel = item.GetProperty("accountLevel").GetValueAsString();

			users.Add(new InitialUserItem(email, accountLevel));
		}

		return users;
	}
}

public class CreateTenantAsStaffBodyValidator : AbstractValidator<CreateTenantAsStaffBody> {
	public CreateTenantAsStaffBodyValidator(IOptions<AppSettings> appSettings) {
		// Existing Name validation
		RuleFor(x => x.Name)
			.NotEmpty().WithMessage("Name is required")
			.DependentRules(() => {
				RuleFor(x => x.Name)
					.Must(name => name.ValueKind == JsonValueKind.String).WithMessage("Name must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Name.GetString()!)
							.MinimumLength(5).WithMessage("Name must be at least 5 characters long");
					});
			});

		// NEW: MaxUsers validation (optional - defaults to DEFAULT_MAX_USERS_PER_TENANT if not provided)
		RuleFor(x => x.MaxUsers)
			.Must(m => m.ValueKind == JsonValueKind.Number ||
								 m.ValueKind == JsonValueKind.Null ||
								 m.ValueKind == JsonValueKind.Undefined)
			.WithMessage("MaxUsers must be a number, null, or undefined")
			.DependentRules(() => {
				RuleFor(x => x.MaxUsers)
					.Must(m => {
						if (m.ValueKind != JsonValueKind.Number) return true;
						var value = m.GetInt32();
						return value > 0;
					})
					.WithMessage("MaxUsers must be greater than 0 when provided");
			});

		// NEW: InitialUsers validation
		RuleFor(x => x.InitialUsers)
			.NotEmpty().WithMessage("InitialUsers is required")
			.Custom((element, context) => {
				if (element.ValueKind != JsonValueKind.Array) {
					context.AddFailure("InitialUsers must be an array");
					return;
				}

				var array = element.EnumerateArray().ToList();

				if (array.Count == 0) {
					context.AddFailure("At least one initial user is required");
					return;
				}

				// Validate doesn't exceed MaxUsers (use default if not provided)
				var body = context.InstanceToValidate as CreateTenantAsStaffBody;
				var maxUsers = body?.MaxUsers.ValueKind == JsonValueKind.Number
					? body.MaxUsers.GetInt32()
					: appSettings.Value.DEFAULT_MAX_USERS_PER_TENANT;

				if (array.Count > maxUsers) {
					context.AddFailure(
						$"InitialUsers count ({array.Count}) cannot exceed MaxUsers ({maxUsers})"
					);
					return;
				}

				// Track for duplicate detection and admin check
				var emailOccurrences = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase);
				var hasAdmin = false;

				// Validate each item
				for (var i = 0; i < array.Count; i++) {
					var item = array[i];

					if (item.ValueKind != JsonValueKind.Object) {
						context.AddFailure($"initialUsers[{i}]", "Must be an object");
						continue;
					}

					// Validate email
					if (!item.TryGetProperty("email", out var emailElement)) {
						context.AddFailure($"initialUsers[{i}].email", "Email is required");
					} else if (emailElement.ValueKind != JsonValueKind.String) {
						context.AddFailure($"initialUsers[{i}].email", "Must be a string");
					} else {
						var email = emailElement.GetString();
						if (string.IsNullOrWhiteSpace(email)) {
							context.AddFailure($"initialUsers[{i}].email", "Email is required");
						} else if (!IsValidEmail(email)) {
							context.AddFailure($"initialUsers[{i}].email", "Invalid email format");
						} else {
							// Track duplicates
							if (!emailOccurrences.TryGetValue(email, out var indices)) {
								indices = new List<int>();
								emailOccurrences[email] = indices;
							}
							indices.Add(i);
						}
					}

					// Validate accountLevel
					if (!item.TryGetProperty("accountLevel", out var levelElement)) {
						context.AddFailure($"initialUsers[{i}].accountLevel", "AccountLevel is required");
					} else if (levelElement.ValueKind != JsonValueKind.String) {
						context.AddFailure($"initialUsers[{i}].accountLevel", "Must be a string");
					} else {
						var level = levelElement.GetString();
						if (string.IsNullOrWhiteSpace(level)) {
							context.AddFailure($"initialUsers[{i}].accountLevel", "AccountLevel is required");
						} else {
							var normalizedLevel = level.ToLowerInvariant();
							if (normalizedLevel != "admin" && normalizedLevel != "user") {
								context.AddFailure(
									$"initialUsers[{i}].accountLevel",
									"AccountLevel must be 'admin' or 'user'"
								);
							} else if (normalizedLevel == "admin") {
								hasAdmin = true;
							}
						}
					}
				}

				// Check for duplicates
				var duplicates = emailOccurrences.Where(kvp => kvp.Value.Count > 1).Select(kvp => kvp.Key).ToList();
				if (duplicates.Count > 0) {
					context.AddFailure("InitialUsers", $"Duplicate emails: {string.Join(", ", duplicates)}");
				}

				// Check for at least one admin
				if (!hasAdmin) {
					context.AddFailure("InitialUsers", "At least one user with accountLevel 'admin' is required");
				}
			});
	}

	private static bool IsValidEmail(string email) {
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			return System.Net.Mail.MailAddress.TryCreate(email, out _);
		} catch {
			return false;
		}
	}
}

public class CreateTenantAsStaffResult {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public static class CreateTenantAsStaff {
	public static async Task<
	Results<
	Ok<CreateTenantAsStaffResult>,
	BadRequest<ApiResponse>
	>>
	HandleCreateTenantAsStaff(
		[FromBody] CreateTenantAsStaffBody createTenantBody,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromServices] IEmailService emailService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IOptions<AppSettings> appSettings,
		[FromServices] ILoggerFactory loggerFactory,
		CancellationToken cancellationToken
	) {
		var logger = loggerFactory.CreateLogger(nameof(CreateTenantAsStaff));

		// Get authenticated staff user
		var staffAccount = authContext.AccountStaff;
		if (staffAccount is null) {
			return TypedResults.BadRequest(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
		}

		// Parse request
		var tenantName = createTenantBody.GetName();
		var maxUsers = createTenantBody.GetMaxUsers();
		var initialUsersItems = createTenantBody.GetInitialUsers();

		// Apply default MaxUsers if not provided
		var effectiveMaxUsers = maxUsers ?? appSettings.Value.DEFAULT_MAX_USERS_PER_TENANT;

		// Convert to service layer types
		var initialUsers = initialUsersItems
			.Select(u => {
				var level = UserAccount.ParseAccountLevel(u.AccountLevel);
				if (level is null) {
					throw new InvalidOperationException($"Invalid account level: {u.AccountLevel}");
				}
				return (u.Email, level.Value);
			})
			.ToList();

		try {
			// Create tenant with initial users
			var result = await tenantAsStaffService.CreateTenantWithInitialUsersAsync(
				tenantName,
				effectiveMaxUsers,
				initialUsers,
				staffAccount.UserId,
				cancellationToken
			);

			// Send invitation emails asynchronously (fire and forget)
			_ = Task.Run(async () => {
				await SendTenantInvitationEmailsAsync(
					emailService,
					logger,
					result.Tenant.Name,
					result.InvitationTokens,
					cancellationToken
				);
			}, cancellationToken);

			logger.LogInformation(
				"Created tenant {TenantId} with {UserCount} initial user invitations",
				result.Tenant.GetRequiredId(),
				result.InvitationTokens.Count
			);

			return TypedResults.Ok(new CreateTenantAsStaffResult {
				Id = result.Tenant.GetRequiredId(),
				Name = result.Tenant.Name
			});

		} catch (InvalidOperationException ex) {
			// Business logic validation failures
			logger.LogWarning(ex, "Tenant creation validation failed");
			return TypedResults.BadRequest(
				ApiResponse.Create(ex.Message, ResponseKeys.BadRequest)
			);
		}
	}

	// NEW: Email sending helper with retry logic
	private static async Task SendTenantInvitationEmailsAsync(
		IEmailService emailService,
		ILogger logger,
		string tenantName,
		List<(string Email, string Token, AccountLevel Level)> invitationTokens,
		CancellationToken cancellationToken
	) {
		const int maxConcurrency = 5;
		using var semaphore = new SemaphoreSlim(maxConcurrency);

		var tasks = invitationTokens.Select(async (invitation) => {
			await semaphore.WaitAsync(cancellationToken);
			try {
				await SendEmailWithRetryAsync(
					async () => {
						await emailService.SendTenantInvitationEmailAsync(
							invitation.Email,
							tenantName,
							invitation.Token,
							invitation.Level
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
	/// Pattern from BulkCreateStaffInvitations.cs
	/// </summary>
	private static async Task SendEmailWithRetryAsync(
		Func<Task> sendEmailAction,
		ILogger logger,
		string email,
		CancellationToken cancellationToken
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

					log.LogWarning(
						exception,
						"Failed to send tenant invitation email to {Email} (attempt {Attempt}/3), " +
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
					await sendEmailAction();
				},
				context,
				cancellationToken
			);

			logger.LogInformation(
				"Successfully sent tenant invitation email to {Email}",
				email
			);
		} catch (Exception ex) {
			logger.LogError(
				ex,
				"Failed to send tenant invitation email to {Email} after 3 attempts",
				email
			);
			// Don't rethrow - email failures shouldn't break the main operation
		}
	}
}
