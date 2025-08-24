namespace MainApi.Src.Features.Common.Auth.Validators;

using FluentValidation;
using MainApi.Src.Features.Common.Auth;
using System.Text.Json;

public class LoginWithEmailAndPasswordDtoValidator : AbstractValidator<LoginWithEmailAndPasswordDto>
{
	public LoginWithEmailAndPasswordDtoValidator()
	{
		RuleFor(x => x.Email)
			.Must(e => e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Email must be a non-empty string")
			.DependentRules(() =>
			{
				RuleFor(x => x.Email.GetString()!)
					.EmailAddress().WithMessage("Email must be a valid email address");
			});

		RuleFor(x => x.Password)
			.Must(e => e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Password must be a non-empty string")
			.DependentRules(() =>
			{
				RuleFor(x => x.Password.GetString()!)
					.MinimumLength(6).WithMessage("Password must be at least 6 characters long");
			});
	}
}
