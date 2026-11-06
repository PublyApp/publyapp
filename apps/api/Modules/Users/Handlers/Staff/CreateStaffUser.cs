using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Services;


namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class CreateStaffUserResult {
	public Guid Id { get; set; }
	public Guid AccountId { get; set; }
}

public class CreateStaffUserBody {
	public JsonElement Email { get; set; }
	public JsonElement LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? SendNotification { get; set; }

	public string GetEmail() {
		return this.Email.GetValueAsString();
	}

	public string GetLastName() {
		return this.LastName.GetValueAsString();
	}

	public string? GetFirstName() {
		return this.FirstName.GetValueAsStringOrNull();
	}

	public string? GetAvatarUrl() {
		return this.AvatarUrl.GetValueAsStringOrNull();
	}

	public bool GetSendNotification() {
		return this.SendNotification.GetValueAsBoolean();
	}

}

public class CreateStaffUserBodyValidator
	: AbstractValidator<CreateStaffUserBody> {
	public CreateStaffUserBodyValidator() {
		this.RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		this.RuleFor(x => x.LastName)
			.MustBeRequiredString("LastName");

		this.RuleFor(x => x.FirstName)
			.MustBeNullableNonEmptyString("FirstName");

		this.RuleFor(x => x.AvatarUrl)
			.MustBeNullableUrl("AvatarUrl");

		this.RuleFor(x => x.SendNotification)
			.MustBeNullableBoolean(
				"SendNotification"
			);
	}
}

public sealed class CreateStaffUser {
	public static async Task<
		Results<
			Created<CreateStaffUserResult>,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromBody] CreateStaffUserBody body,
		[FromServices] ICreateStaffUserService createStaffUserService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CreateStaffUser> logger,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;
		var password = CryptoUtils.RandomString(env.PASSWORD_MIN_LENGTH);
		password = PasswordUtils.HashPassword(password);

		var sendNotification = body.GetSendNotification();

		var serviceResult = await createStaffUserService.CreateStaffUserAsync(
			new CreateStaffUserArgs(
				Email: body.GetEmail(),
				LastName: body.GetLastName(),
				FirstName: body.GetFirstName(),
				AvatarUrl: body.GetAvatarUrl(),
				Password: password,
				SendNotification: sendNotification
			),
			cancellationToken
		);

		if (serviceResult is CreateStaffUserServiceResult.UserAlreadyStaffUser) {
			return TypedProblems.BadRequest(
				"User is already member of staff",
				ResponseKeys.UserAlreadyMemberOfStaff
			);
		}

		if (serviceResult is CreateStaffUserServiceResult.UserHasTenantOrProjectAccounts) {
			return TypedProblems.BadRequest(
				"This user already has tenant or project accounts. "
				+ "Staff and tenant/project accounts are mutually exclusive.",
				ResponseKeys.UserHasTenantOrProjectAccounts
			);
		}

		if (serviceResult is CreateStaffUserServiceResult.Success successResult) {
			if (sendNotification && !successResult.IsNewUser) {
				_ = Task.Run(
					async () => {
						try {
							await emailService.SendJoinedStaffNotificationEmailAsync(successResult.User.Email);
						} catch (Exception ex) {
							if (logger.IsEnabled(LogLevel.Error)) {
								logger.LogError(
									ex,
									"Failed to send staff-join notification to {Email}",
									successResult.User.Email
								);
							}
						}
					},
					CancellationToken.None
				);
			}

			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Staff user create result: {@LogData}",
					new {
						UserId = successResult.User.GetRequiredId(),
						AccountId = successResult.Account.GetRequiredId(),
						IsNewUser = successResult.IsNewUser
					}
				);
			}

			return TypedResults.Created(
				(string?)null,
				new CreateStaffUserResult {
					Id = successResult.User.GetRequiredId(),
					AccountId = successResult.Account.GetRequiredId(),
				}
			);
		}

		if (logger.IsEnabled(LogLevel.Error)) {
			logger.LogError(
				"Failed to create staff user: {@LogData}",
				new { Body = body.Email.GetValueAsString() }
			);
		}

		return TypedProblems.BadRequest(
			"Failed to create user",
			ResponseKeys.FailedToCreateUser
		);
	}
}
