namespace MainApi.Src.Lib;

public interface IAppResponseResult
{
	string Message { get; set; }
	string Key { get; set; }
}

public class AppResponseResult : IAppResponseResult
{
	public string Message { get; set; } = string.Empty;
	public string Key { get; set; } = string.Empty;
}
