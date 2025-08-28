namespace MainApi.Src.Features.Staff.Tenant.Handlers.CreateTenantStaff;

using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.Tenant;
using System.Text.Json;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using FluentValidation;

public class CreateTenantStaffBody
{
	public JsonElement Name { get; set; }

	public string GetName()
	{
		string name = Name.ValueKind switch
		{
			JsonValueKind.String => Name.GetString()!,
			JsonValueKind.Number => Name.GetRawText(), // or .GetInt32(), etc.
			_ => throw new Exception("Invalid type for name")
		};

		return name;
	}
}

public class CreateTenantStaffBodyValidator : AbstractValidator<CreateTenantStaffBody>
{
	public CreateTenantStaffBodyValidator()
	{
		RuleFor(x => x.Name)
			.NotEmpty().WithMessage("Name is required")
			.DependentRules(() =>
			{
				RuleFor(x => x.Name)
					.Must(name => name.ValueKind == JsonValueKind.String).WithMessage("Name must be a string")
					.DependentRules(() =>
					{
						RuleFor(x => x.Name.GetString()!)
							.MinimumLength(5).WithMessage("Name must be at least 5 characters long");
					});
			});
	}
}

public class CreateTenantStaffSuccessResultTenantData
{
	public string Id { get; set; } = string.Empty;
	public string TenantName { get; set; } = string.Empty;
}

public class CreateTenantStaffSuccessResult : AppResponseResult
{
	public new string Message { get; set; } = "Tenant created successfully";
	public new string Key { get; set; } = "tenant-created-successfully";
	public CreateTenantStaffSuccessResultTenantData Tenant { get; set; } = new CreateTenantStaffSuccessResultTenantData();

	public static CreateTenantStaffSuccessResult GetApiResponse(Tenant tenant)
	{
		return new CreateTenantStaffSuccessResult
		{
			Tenant = new CreateTenantStaffSuccessResultTenantData
			{
				Id = tenant.Id ?? throw new Exception("Tenant ID is null"),
				TenantName = tenant.Name ?? throw new Exception("Tenant name is null")
			}
		};
	}
}

public static class CreateTenantStaff
{
	public static async Task<
	Results<
	Ok<CreateTenantStaffSuccessResult>,
	BadRequest<AppResponseResult>
	>>
	HandleCreateTenantStaff(
		[FromBody] CreateTenantStaffBody createTenantBody,
		[FromServices] ITenantStaffService tenantStaffService
		)
	{
		string tenantName = createTenantBody.GetName();

		var tenant = new Tenant
		{
			Name = tenantName,
		};

		var savedTenant = await tenantStaffService.CreateTenant(tenant);

		return TypedResults.Ok(CreateTenantStaffSuccessResult.GetApiResponse(savedTenant));
	}
}
