namespace MainApi.Src.Features.Staff.Tenant;

using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.Tenant;
using FluentValidation;
using System.Text.Json;

public class CreateTenantDto
{
	public JsonElement Name { get; set; }
}

public static class TenantStaffHandlers
{
	public static async Task<IResult> CreateTenant(
		[FromBody] CreateTenantDto createTenantDto,
		[FromServices] ITenantStaffService tenantStaffService,
		[FromServices] IValidator<CreateTenantDto> validator
		)
	{
		var validationResult = await validator.ValidateAsync(createTenantDto);
		if (!validationResult.IsValid)
		{
			return Results.BadRequest(new
			{
				message = "Validation failed",
				key = "validation-failed",
				errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
			});
		}

		string tenantName = createTenantDto.Name.ValueKind switch
		{
			JsonValueKind.String => createTenantDto.Name.GetString()!,
			JsonValueKind.Number => createTenantDto.Name.GetRawText(), // or .GetInt32(), etc.
			_ => throw new Exception("Invalid type for name")
		};

		var tenant = new Tenant
		{
			Name = tenantName,
		};

		var result = await tenantStaffService.CreateTenant(tenant);
		return Results.Ok(result);
	}
}
