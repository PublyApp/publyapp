namespace MainApi.Src.Features.Staff.Tenant.Validators;

using System.Text.Json;
using FluentValidation;

public class CreateTenantStaffValidator : AbstractValidator<CreateTenantDto>
{
	public CreateTenantStaffValidator()
	{
		RuleFor(x => x.Name)
			.Must(e => e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage("Name must be a non-empty string")
			.DependentRules(() =>
			{
				RuleFor(x => x.Name.GetString()!)
						.MinimumLength(2).WithMessage("Name must be at least 2 characters long")
						.MaximumLength(255).WithMessage("Name cannot exceed 255 characters");
			});
	}
}
