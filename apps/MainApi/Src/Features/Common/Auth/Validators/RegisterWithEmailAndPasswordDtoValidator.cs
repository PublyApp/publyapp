namespace MainApi.Src.Features.Common.Auth.Validators;

using FluentValidation;
using MainApi.Src.Features.Common.Auth;

public class RegisterWithEmailAndPasswordDtoValidator : AbstractValidator<RegisterWithEmailAndPasswordDto>
{
	public RegisterWithEmailAndPasswordDtoValidator()
	{
		RuleFor(x => x.Email)
				.NotEmpty().WithMessage("Email is required")
				.EmailAddress().WithMessage("Email must be a valid email address");

		RuleFor(x => x.Password)
				.NotEmpty().WithMessage("Password is required")
				.MinimumLength(8).WithMessage("Password must be at least 8 characters long")
				.Matches(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]")
				.WithMessage("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character");
	}
}
