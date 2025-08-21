namespace MainApi.Src.Features.Common.Auth.Validators;

using FluentValidation;
using MainApi.Src.Features.Common.Auth;

public class LoginWithEmailAndPasswordDtoValidator : AbstractValidator<LoginWithEmailAndPasswordDto>
{
    public LoginWithEmailAndPasswordDtoValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required")
            .EmailAddress().WithMessage("Email must be a valid email address");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters long");
    }
}
