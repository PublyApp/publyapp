namespace PublyApp.Api.Lib.Utils;

public static class SeederLoggerUtils {
	private static readonly Lazy<
		Microsoft.Extensions.Logging.ILoggerFactory
	> _ConsoleLoggerFactory = new(
		() => Microsoft.Extensions.Logging.LoggerFactory.Create(
			builder => {
				builder.AddConsole();
			}
		),
		LazyThreadSafetyMode.ExecutionAndPublication
	);

	public static Microsoft.Extensions.Logging.ILogger<T>
	CreateDefault<T>() {
		if (
			AppEnvironment.IsTesting
			&& !AppEnvironment.IsTestVerboseLoggingEnabled
		) {
			return Microsoft.Extensions.Logging.Abstractions
				.NullLogger<T>.Instance;
		}

		return _ConsoleLoggerFactory.Value.CreateLogger<T>();
	}
}
