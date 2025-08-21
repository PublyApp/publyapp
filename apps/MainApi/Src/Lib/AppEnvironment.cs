namespace MainApi.Src.Lib;

public static class AppEnvironment
{
	public static readonly string MONGODB_URI = GetEnvironmentVariable("MONGODB_URI");
	public static readonly string MONGODB_DATABASE_NAME = GetEnvironmentVariable("MONGODB_DATABASE_NAME");

	private static bool IS_DOTENV_LOADED = false;

	public static void LoadDotEnv()
	{
		if (IS_DOTENV_LOADED) return;
		string path = Path.Combine(Directory.GetCurrentDirectory(), ".env.local");
		DotNetEnv.Env.Load(path);
		IS_DOTENV_LOADED = true;
	}

	private static string GetEnvironmentVariable(string name)
	{
		LoadDotEnv();
		return Environment.GetEnvironmentVariable(name) ?? throw new Exception($"{name} is not set");
	}
}
