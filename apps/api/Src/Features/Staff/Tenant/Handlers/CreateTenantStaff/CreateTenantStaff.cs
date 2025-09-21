namespace MainApi.Src.Features.Staff.Tenant.Handlers.CreateStaffTenant;

using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.Tenant;
using System.Text.Json;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using FluentValidation;
using MainApi.Src.Lib.Utils;

public class CreateStaffTenantBody {
	public JsonElement Name { get; set; }

	public string GetName() {
		string name = Name.ValueKind switch {
			JsonValueKind.String => Name.GetString()!,
			JsonValueKind.Number => Name.GetRawText(), // or .GetInt32(), etc.
			_ => throw new Exception("Invalid type for name")
		};

		return name;
	}
}

public class CreateStaffTenantBodyValidator : AbstractValidator<CreateStaffTenantBody> {
	public CreateStaffTenantBodyValidator() {
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
	}
}

public class CreateStaffTenantResult {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public static class CreateStaffTenant {
	public static async Task<
	Results<
	Ok<CreateStaffTenantResult>,
	BadRequest<ApiResponse>
	>>
	HandleCreateStaffTenant(
		[FromBody] CreateStaffTenantBody createTenantBody,
		[FromServices] IStaffTenantService StaffTenantService
		) {
		string tenantName = createTenantBody.GetName();

		var tenant = new Tenant {
			Name = tenantName,
			Code = CryptoUtils.RandomString(10).ToLower()
		};

		var savedTenant = await StaffTenantService.CreateTenant(tenant);

		return TypedResults.Ok(new CreateStaffTenantResult {
			Id = savedTenant.Id,
			Name = savedTenant.Name
		});
	}
}
