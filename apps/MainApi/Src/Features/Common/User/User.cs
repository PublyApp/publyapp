using MainApi.Src.Data;

namespace MainApi.Src.Features.Common.User;

public class User : INoTenantFilter
{
	public string Id { get; set; } = string.Empty;
	public string Email { get; set; } = string.Empty;
	public string Password { get; set; } = string.Empty;

	public static string CollectionName ="_User";
}
