using MainApi.Src.Data;

namespace MainApi.Src.Features.Common.Tenant;

public class Tenant : BaseAttributes, INoTenantEntity
{
	public string? Name { get; set; }
}
