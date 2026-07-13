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
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record CreateTenantAsStaffInitialUserItem(string Email, string AccountLevel);

public class CreateTenantAsStaffBody {
	public JsonElement Name { get; set; }
	public JsonElement MaxUsers { get; set; }
	public JsonElement InitialUsers { get; set; }
	public JsonElement? Code { get; set; }
	public JsonElement? SeedDefaultProfile { get; set; }
	public JsonElement? LogoUrl { get; set; }
	public JsonElement? LegalName { get; set; }
	public JsonElement? Description { get; set; }
	public JsonElement? WebsiteUrl { get; set; }
	public JsonElement? BillingEmail { get; set; }
	public JsonElement? SupportEmail { get; set; }
	public JsonElement? DefaultLocale { get; set; }
	public JsonElement? Timezone { get; set; }
	public JsonElement? Notes { get; set; }

	public string GetName() {
		return Name.GetValueAsString();
	}

	public int? GetMaxUsers() {
		return MaxUsers.GetValueAsInt32OrNull();
	}

	public string? GetCode() {
		return Code.GetValueAsStringOrNull();
	}

	public string? GetLogoUrl() {
		return LogoUrl.GetValueAsStringOrNull();
	}

	public string? GetLegalName() {
		return NormalizeClearableString(LegalName.GetValueAsStringOrNull());
	}

	public string? GetDescription() {
		return NormalizeClearableString(Description.GetValueAsStringOrNull());
	}

	public string? GetWebsiteUrl() {
		return NormalizeClearableString(WebsiteUrl.GetValueAsStringOrNull());
	}

	public string? GetBillingEmail() {
		return NormalizeClearableString(BillingEmail.GetValueAsStringOrNull());
	}

	public string? GetSupportEmail() {
		return NormalizeClearableString(SupportEmail.GetValueAsStringOrNull());
	}

	public string? GetDefaultLocale() {
		return NormalizeClearableString(DefaultLocale.GetValueAsStringOrNull());
	}

	public string? GetTimezone() {
		return NormalizeClearableString(Timezone.GetValueAsStringOrNull());
	}

	public string? GetNotes() {
		return NormalizeClearableString(Notes.GetValueAsStringOrNull());
	}

	// Trims and maps whitespace-only input to null so "cleared"/"omitted" has a
	// single representation — otherwise {"legalName": "  "} would persist a
	// non-null value the UI has to separately treat as empty alongside actual null.
	private static string? NormalizeClearableString(string? value) {
		if (value is null) {
			return null;
		}
		var trimmed = value.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	// Defaults to true to preserve current behavior when the field is omitted.
	public bool GetSeedDefaultProfile() {
		var kind = SeedDefaultProfile?.ValueKind;
		if (kind is null or JsonValueKind.Null or JsonValueKind.Undefined) {
			return true;
		}
		return SeedDefaultProfile.GetValueAsBoolean();
	}

	public List<CreateTenantAsStaffInitialUserItem> GetInitialUsers() {
		if (InitialUsers.ValueKind != JsonValueKind.Array) {
			throw new ArgumentException("InitialUsers must be an array", nameof(InitialUsers));
		}

		var users = new List<CreateTenantAsStaffInitialUserItem>();
		foreach (var item in InitialUsers.EnumerateArray()) {
			var email = item.GetProperty("email").GetValueAsString();
			var accountLevel = item.GetProperty("accountLevel").GetValueAsString();

			users.Add(new CreateTenantAsStaffInitialUserItem(email, accountLevel));
		}

		return users;
	}
}

/// <summary>
/// Keeps staff tenant creation input checks centralized at the request boundary while preserving
/// JsonElement request semantics. Follows the JsonElementRules.* convention in
/// docs/guides/validator-conventions.md.
/// </summary>
public partial class CreateTenantAsStaffBodyValidator : AbstractValidator<CreateTenantAsStaffBody> {
	// Lowercase letters, digits, and single hyphens between segments — mirrors the canonical
	// shape of the random codes (Tenant.Code setter also lowercases, but we reject uppercase
	// input outright rather than silently transforming it into a different string than sent).
	private const int CodeMinLength = 3;
	private const int CodeMaxLength = 40;

	[GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
	private static partial Regex CodeFormatRegex();

	public CreateTenantAsStaffBodyValidator() {
		RuleFor(x => x.Name)
			.MustBeRequiredStringWithLength("Name", 5, int.MaxValue);

		RuleFor(x => x.MaxUsers).Custom((element, context) => {
			var kind = element.ValueKind;
			if (kind is JsonValueKind.Null or JsonValueKind.Undefined) {
				return;
			}
			if (kind is JsonValueKind.Number) {
				if (!element.TryGetInt32(out var v) || v <= 0) {
					context.AddFailure("MaxUsers must be greater than 0 when provided");
				}
				return;
			}
			context.AddFailure("MaxUsers must be a number, null, or undefined");
		});

		RuleFor(x => x.Code).Custom(ValidateCode);

		RuleFor(x => x.SeedDefaultProfile)
			.MustBeNullableBoolean("SeedDefaultProfile");

		RuleFor(x => x.LogoUrl)
			.MustBeNullableLogoUrl();

		RuleFor(x => x.LegalName)
			.MustBeNullableStringWithMaxLength("LegalName", 256);

		RuleFor(x => x.Description)
			.MustBeNullableStringWithMaxLength("Description", 1024);

		RuleFor(x => x.WebsiteUrl)
			.MustBeNullableUrl("WebsiteUrl");

		RuleFor(x => x.BillingEmail)
			.MustBeNullableEmailWithMaxLength("BillingEmail", 320);

		RuleFor(x => x.SupportEmail)
			.MustBeNullableEmailWithMaxLength("SupportEmail", 320);

		RuleFor(x => x.DefaultLocale)
			.MustBeNullableLocale();

		RuleFor(x => x.Timezone)
			.MustBeNullableTimezone();

		RuleFor(x => x.Notes)
			.MustBeNullableStringWithMaxLength("Notes", 4000);

		RuleFor(x => x.InitialUsers)
			.Custom(ValidateInitialUsers);
	}

	private static void ValidateCode(
		JsonElement? element,
		ValidationContext<CreateTenantAsStaffBody> context
	) {
		if (element is null) {
			return;
		}

		var kind = element.Value.ValueKind;
		if (kind is JsonValueKind.Null or JsonValueKind.Undefined) {
			return;
		}

		if (kind != JsonValueKind.String) {
			context.AddFailure("Code must be a string, null, or omitted");
			return;
		}

		var code = element.Value.GetString();
		if (string.IsNullOrWhiteSpace(code)) {
			context.AddFailure("Code must not be empty when provided");
			return;
		}

		if (code.Length is < CodeMinLength or > CodeMaxLength) {
			context.AddFailure(
				$"Code must be between {CodeMinLength} and {CodeMaxLength} characters"
			);
			return;
		}

		if (!CodeFormatRegex().IsMatch(code)) {
			context.AddFailure(
				"Code must contain only lowercase letters, digits, and hyphens, "
				+ "and cannot start or end with a hyphen"
			);
		}
	}

	private static void ValidateInitialUsers(
		JsonElement element,
		ValidationContext<CreateTenantAsStaffBody> context
	) {
		if (element.ValueKind
			is JsonValueKind.Undefined
			or JsonValueKind.Null) {
			context.AddFailure("InitialUsers is required");
			return;
		}

		if (element.ValueKind != JsonValueKind.Array) {
			context.AddFailure("InitialUsers must be an array");
			return;
		}

		var array = element.EnumerateArray().ToList();

		if (array.Count == 0) {
			context.AddFailure("At least one initial user is required");
			return;
		}

		var body = context.InstanceToValidate;
		// Invalid numeric tokens are reported by the MaxUsers rule above; avoid
		// throwing here while validating the independent InitialUsers rule.
		var maxUsers = AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT;
		if (
			body?.MaxUsers.ValueKind == JsonValueKind.Number &&
			body.MaxUsers.TryGetInt32(out var parsedMaxUsers)
		) {
			maxUsers = parsedMaxUsers;
		}

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
				ValidateInitialUserEmail(context, emailOccurrences, i, emailElement);
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
					var parsedLevel = UserAccount.ParseLevel(level);
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
	}

	private static void ValidateInitialUserEmail(
		ValidationContext<CreateTenantAsStaffBody> context,
		Dictionary<string, List<int>> emailOccurrences,
		int index,
		JsonElement emailElement
	) {
		var email = emailElement.GetString();
		if (string.IsNullOrWhiteSpace(email)) {
			context.AddFailure($"initialUsers[{index}].email", "Email is required");
		} else if (!IsValidEmail(email)) {
			context.AddFailure($"initialUsers[{index}].email", "Invalid email format");
		} else {
			if (!emailOccurrences.TryGetValue(email, out var indices)) {
				indices = [];
				emailOccurrences[email] = indices;
			}
			indices.Add(index);
		}
	}

	private static bool IsValidEmail(string email) {
		if (string.IsNullOrWhiteSpace(email)) {
			return false;
		}

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

public sealed class CreateTenantAsStaff {
	public static async Task<
	Results<
	Created<CreateTenantAsStaffResult>,
	AppBadRequestHttpResult,
	AppValidationProblemHttpResult,
	AppInternalServerErrorHttpResult
	>>
	Handle(
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
		var code = body.GetCode();
		var seedDefaultProfile = body.GetSeedDefaultProfile();
		var logoUrl = body.GetLogoUrl();
		var legalName = body.GetLegalName();
		var description = body.GetDescription();
		var websiteUrl = body.GetWebsiteUrl();
		var billingEmail = body.GetBillingEmail();
		var supportEmail = body.GetSupportEmail();
		var defaultLocale = body.GetDefaultLocale();
		var timezone = body.GetTimezone();
		var notes = body.GetNotes();

		var effectiveMaxUsers = maxUsers ?? AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT;

		var initialUsers = initialUsersItems
			.Select(u => {
				var level = UserAccount.ParseLevel(u.AccountLevel);
				if (level is null) {
					throw new InvalidOperationException($"Invalid account level: {u.AccountLevel}");
				}
				return (u.Email, level.Value);
			})
			.ToList();

		try {
			var args = new CreateTenantWithInitialUsersArgs(
				Name: tenantName,
				MaxUsers: effectiveMaxUsers,
				InitialUsers: initialUsers,
				InvitedByUserId: staffAccount.UserId,
				Code: code,
				SeedDefaultProfile: seedDefaultProfile,
				LogoUrl: logoUrl,
				LegalName: legalName,
				Description: description,
				WebsiteUrl: websiteUrl,
				BillingEmail: billingEmail,
				SupportEmail: supportEmail,
				DefaultLocale: defaultLocale,
				Timezone: timezone,
				Notes: notes
			);

			var outcome = await tenantAsStaffService.CreateTenantWithInitialUsersAsync(
				args,
				cancellationToken
			);

			if (outcome is CreateTenantWithInitialUsersOutcome.CodeAlreadyTaken) {
				return TypedProblems.ValidationProblem(
					"This workspace code is already taken",
					ResponseKeys.CodeAlreadyTaken,
					new Dictionary<string, string[]> {
						{ "code", ["This workspace code is already taken"] }
					}
				);
			}

			if (outcome is CreateTenantWithInitialUsersOutcome.CodeGenerationFailed) {
				return TypedProblems.InternalServerError(
					"Failed to generate a unique tenant code. Please try again.",
					ResponseKeys.InternalServerError
				);
			}

			if (outcome is not CreateTenantWithInitialUsersOutcome.Success success) {
				throw new InvalidOperationException(
					$"Unknown create tenant with initial users outcome: {outcome.GetType().Name}"
				);
			}

			var result = success.Data;

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
