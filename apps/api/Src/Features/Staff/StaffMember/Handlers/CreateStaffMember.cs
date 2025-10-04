using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.StaffMember.Handlers;

public class CreateStaffMemberResult {
	public Guid Id { get; set; }
	public Guid AccountId { get; set; }
}

public class CreateStaffMemberBody {
	public JsonElement Email { get; set; }
	public JsonElement LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }

	public string GetEmail() {
		return Email.ValueKind switch {
			JsonValueKind.String => Email.GetString() ?? throw new InvalidOperationException("Email cannot be null"),
			_ => throw new InvalidOperationException("Email must be a string")
		};
	}
	public string GetLastName() {
		return LastName.ValueKind switch {
			JsonValueKind.String => LastName.GetString() ?? throw new InvalidOperationException("LastName cannot be null"),
			_ => throw new InvalidOperationException("LastName must be a string")
		};
	}

	public string? GetFirstName() {
		return FirstName?.ValueKind switch {
			JsonValueKind.Null => null,
			JsonValueKind.String => FirstName?.GetString(),
			_ => throw new InvalidOperationException("FirstName must be a string or null")
		};
	}

	public string? GetAvatarUrl() {
		return AvatarUrl?.ValueKind switch {
			JsonValueKind.Null => null,
			JsonValueKind.String => AvatarUrl?.GetString(),
			_ => throw new InvalidOperationException("AvatarUrl must be a string or null")
		};
	}
}

public class PasswordRegisterBodyValidator : AbstractValidator<CreateStaffMemberBody> {
	public PasswordRegisterBodyValidator() {
		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() => {
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String).WithMessage("mail must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Email.GetString()!)
							.EmailAddress().WithMessage("Invalid email address");
					});
			});

		RuleFor(x => x.LastName)
			.NotEmpty().WithMessage("LastName is required")
			.DependentRules(() => {
				RuleFor(x => x.LastName)
					.Must(lastName => lastName.ValueKind == JsonValueKind.String).WithMessage("LastName must be a string")
					.DependentRules(() => {
						RuleFor(x => x.LastName.GetString()!)
							.NotEmpty().WithMessage("LastName is required");
					});
			});

		RuleFor(x => x.FirstName)
			.Must(BeNullableString)
			.WithMessage("FirstName must be a string or null")
				.DependentRules(() => {
					RuleFor(x => x.FirstName)
						.NotEmpty().WithMessage("FirstName must not be empty");
				});

		RuleFor(x => x.AvatarUrl)
			.Must(BeNullableString)
			.WithMessage("AvatarUrl must be a string or null")
				.DependentRules(() => {
					RuleFor(x => x.AvatarUrl)
						.Must(BeNullableValidUrl)
						.WithMessage("AvatarUrl must be a valid URL");
				});
	}

	private static bool BeNullableString(JsonElement? element) {
		if (element is null) {
			return true;
		}
		return element?.ValueKind == JsonValueKind.String;
	}

	private static bool BeNullableValidUrl(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element?.ValueKind != JsonValueKind.String) {
			return false;
		}

		var url = element?.GetString();

		if (string.IsNullOrWhiteSpace(url)) {
			return false;
		}

		if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? result)) {
			return false;
		}

		if (result.Scheme != Uri.UriSchemeHttp && result.Scheme != Uri.UriSchemeHttps) {
			return false;
		}

		return true;
	}
}

public class CreateStaffMember {
	public static async Task<
		Results<
			Ok<CreateStaffMemberResult>,
			BadRequest<ApiResponse>
		>
	> HandleCreateStaffMember(
		[FromBody] CreateStaffMemberBody body,
		[FromServices] IUserService userService,
		[FromServices] IPasswordService passwordService,
		[FromServices] IAccountService accountService,
		[FromServices] IOptions<AppSettings> appSettings,
		CancellationToken cancellationToken = default
	) {
		var password = CryptoUtils.RandomString(appSettings.Value.PASSWORD_MIN_LENGTH);
		password = passwordService.HashPassword(password);

		var user = new User {
			Email = body.GetEmail(),
			Password = password,
			LastName = body.GetLastName(),
			FirstName = body.GetFirstName(),
			AvatarUrl = body.GetAvatarUrl(),
		};

		var userResult = await userService.CreateUserAsync(user, cancellationToken);

		if (userResult is CreateUserResult.UserAlreadyExists) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			));
		}

		if (userResult is not CreateUserResult.Success success) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Failed to create user",
				ResponseKeys.FailedToCreateUser
			));
		}

		// Create staff account using AccountService
		// (it handles getting the staff tenant internally)
		var accountResult = await accountService.CreateStaffAccountAsync(
			success.User.Id,
			cancellationToken
		);

		if (accountResult is CreateStaffAccountResult.UserAlreadyStaffMember) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"User is already member of staff",
				ResponseKeys.UserAlreadyMemberOfStaff
			));
		}

		if (accountResult is CreateStaffAccountResult.Success accountSuccess) {
			return TypedResults.Ok(new CreateStaffMemberResult {
				Id = success.User.Id,
				AccountId = accountSuccess.Account.Id,
			});
		}

		return TypedResults.BadRequest(ApiResponse.Create(
			"Failed to create user",
			ResponseKeys.FailedToCreateUser
		));
	}
}
