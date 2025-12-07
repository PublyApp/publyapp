using System.Text.Json;

using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.TenantsAsStaff.Handlers;

public class CreateTenantAsStaffBody {
	public JsonElement Name { get; set; }
	public JsonElement MaxUsers { get; set; }
	public JsonElement InitialUsers { get; set; }

	public string GetName() {
		string name = Name.ValueKind switch {
			JsonValueKind.String => Name.GetString() ?? throw new Exception("Name cannot be null"),
			_ => throw new Exception("Name must be a string")
		};

		return name;
	}
}

public class CreateTenantAsStaffBodyValidator : AbstractValidator<CreateTenantAsStaffBody> {
	public CreateTenantAsStaffBodyValidator() {
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

public class CreateTenantAsStaffResult {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public static class CreateTenantAsStaff {
	public static async Task<
	Results<
	Ok<CreateTenantAsStaffResult>,
	BadRequest<ApiResponse>
	>>
	HandleCreateTenantAsStaff(
		[FromBody] CreateTenantAsStaffBody createTenantBody,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		CancellationToken cancellationToken
		) {
		string tenantName = createTenantBody.GetName();

		// int maxUsers = createTenantBody.GetMaxUsers();

		var tenant = new MainApi.Src.Modules.Shared.Tenants.Tenant {
			Name = tenantName,
			Code = CryptoUtils.RandomString(10).ToLower(),
			Status = Shared.Tenants.TenantStatus.Pending
		};

		var savedTenant = await tenantAsStaffService.CreateTenant(tenant, cancellationToken);

		return TypedResults.Ok(new CreateTenantAsStaffResult {
			Id = savedTenant.GetRequiredId(),
			Name = savedTenant.Name
		});
	}
}
