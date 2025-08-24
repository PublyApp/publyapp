namespace MainApi.Src.Features.Common.Auth.Validators;

using FluentValidation;
using MainApi.Src.Features.Common.Auth;
using System.Text.Json;

public class RegisterWithEmailAndPasswordDtoValidator : AbstractValidator<RegisterWithEmailAndPasswordDto>
{
	public RegisterWithEmailAndPasswordDtoValidator()
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
					.MinimumLength(8).WithMessage("Password must be at least 8 characters long")
					.Matches(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]")
					.WithMessage("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character");
			});
	}
}
