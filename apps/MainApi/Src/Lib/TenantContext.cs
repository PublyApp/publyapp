namespace MainApi.Src.Lib;

public interface ITenantContext
{
	string? TenantId { get; set; }
}

public class TenantContext : ITenantContext
{
	public string? TenantId { get; set; }
}
