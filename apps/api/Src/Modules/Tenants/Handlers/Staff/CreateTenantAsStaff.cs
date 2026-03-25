using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using Polly;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public class CreateTenantAsStaffBody {
	public JsonElement Name { get; set; }
	public JsonElement MaxUsers { get; set; }
	public JsonElement InitialUsers { get; set; }

	public string GetName() {
		return Name.GetValueAsString();
	}

	public int? GetMaxUsers() {
		return MaxUsers.GetValueAsInt32OrNull();
	}

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
	public CreateTenantAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBeRequiredString("Name")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				var str = e.GetString();
				return str is not null
					&& str.Length >= 5;
			})
			.WithMessage(
				"Name must be at least"
				+ " 5 characters long"
			);

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

				var body = context.InstanceToValidate as CreateTenantAsStaffBody;
				var maxUsers = body?.MaxUsers.ValueKind == JsonValueKind.Number
					? body.MaxUsers.GetInt32()
					: AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT;

				if (array.Count > maxUsers) {
					context.AddFailure(
						$"InitialUsers count ({array.Count}) cannot exceed MaxUsers ({maxUsers})"
					);
					return;
				}

				var emailOccurrences = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase);
				var hasAdmin = false;

				for (var i = 0; i < array.Count; i++) {
					var item = array[i];

					if (item.ValueKind != JsonValueKind.Object) {
						context.AddFailure($"initialUsers[{i}]", "Must be an object");
						continue;
					}

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
							if (!emailOccurrences.TryGetValue(email, out var indices)) {
								indices = [];
								emailOccurrences[email] = indices;
							}
							indices.Add(i);
						}
					}

					if (!item.TryGetProperty("accountLevel", out var levelElement)) {
						context.AddFailure($"initialUsers[{i}].accountLevel", "AccountLevel is required");
					} else if (levelElement.ValueKind != JsonValueKind.String) {
						context.AddFailure($"initialUsers[{i}].accountLevel", "Must be a string");
					} else {
						var level = levelElement.GetString();
						if (string.IsNullOrWhiteSpace(level)) {
							context.AddFailure(
								$"initialUsers[{i}].accountLevel",
								"AccountLevel is required"
							);
						} else {
							var parsedLevel = UserAccount.ParseAccountLevel(level);
							if (parsedLevel is null) {
								context.AddFailure(
									$"initialUsers[{i}].accountLevel",
									"AccountLevel must be 'admin' or 'user'"
								);
							} else if (parsedLevel is AccountLevel.Admin) {
								hasAdmin = true;
							}
						}
					}
				}

				var duplicates = emailOccurrences
					.Where(kvp => kvp.Value.Count > 1)
					.Select(kvp => kvp.Key)
					.ToList();
				if (duplicates.Count > 0) {
					context.AddFailure("InitialUsers", $"Duplicate emails: {string.Join(", ", duplicates)}");
				}

				if (!hasAdmin) {
					context.AddFailure(
						"InitialUsers",
						"At least one user with accountLevel 'admin' is required"
					);
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

public class CreateTenantAsStaff {
	public static async Task<
	Results<
	Created<CreateTenantAsStaffResult>,
	AppBadRequestHttpResult
	>>
	HandleCreateTenantAsStaff(
		[FromBody] CreateTenantAsStaffBody body,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromServices] IEmailService emailService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<CreateTenantAsStaff> logger,
		CancellationToken cancellationToken
	) {
		var staffAccount = authContext.AccountStaff;
		if (staffAccount is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var tenantName = body.GetName();
		var maxUsers = body.GetMaxUsers();
		var initialUsersItems = body.GetInitialUsers();

		var effectiveMaxUsers = maxUsers ?? AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT;

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
			var result = await tenantAsStaffService.CreateTenantWithInitialUsersAsync(
				tenantName,
				effectiveMaxUsers,
				initialUsers,
				staffAccount.UserId,
				cancellationToken
			);

			_ = Task.Run(async () => {
				await SendTenantInvitationEmailsAsync(
					emailService,
					logger,
					result.Tenant.Name,
					result.InvitationTokens,
					cancellationToken
				);
			}, cancellationToken);

			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Created tenant {TenantId} with {UserCount} initial user invitations",
					result.Tenant.GetRequiredId(),
					result.InvitationTokens.Count
				);
			}

			return TypedResults.Created(
				(string?)null,
				new CreateTenantAsStaffResult {
					Id = result.Tenant.GetRequiredId(),
					Name = result.Tenant.Name
				}
			);

		} catch (InvalidOperationException ex) {
			logger.LogWarning(ex, "Tenant creation validation failed");
			return TypedProblems.BadRequest(ex.Message, ResponseKeys.BadRequest);
		}
	}

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
			await retryPolicy.ExecuteAsync(
				async (ctx, ct) => {
					await sendEmailAction();
				},
				context,
				cancellationToken
			);

			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Successfully sent tenant invitation email to {Email}",
					email
				);
			}
		} catch (Exception ex) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError(
					ex,
					"Failed to send tenant invitation email to {Email} after 3 attempts",
					email
				);
			}
		}
	}
}
