namespace MainApi.Src.Features.Common.Profile;

using MainApi.Src.Data;

public class ProfileTenant : BaseAttributes, ITenantEntity
{
	public string TenantId { get; set; } = string.Empty;
}
