using Microsoft.Extensions.Logging;

namespace PublyApp.Api.Lib.Testing.Fakes;

public sealed record CapturedLog(
	LogLevel Level,
	string Category,
	string Message,
	IReadOnlyList<KeyValuePair<string, object?>> State,
	Exception? Exception
);

public sealed class CapturingLogger<T> : ILogger<T> {
	public List<CapturedLog> Entries { get; } = [];

	public IReadOnlyList<CapturedLog> Warnings {
		get {
			return Entries.Where(entry => entry.Level == LogLevel.Warning).ToList();
		}
	}

	public IDisposable BeginScope<TState>(TState state) where TState : notnull {
		return NullScope.Instance;
	}

	public bool IsEnabled(LogLevel logLevel) {
		return true;
	}

	public void Log<TState>(
		LogLevel logLevel,
		EventId eventId,
		TState state,
		Exception? exception,
		Func<TState, Exception?, string> formatter
	) {
		Entries.Add(new CapturedLog(
			logLevel,
			typeof(T).FullName ?? typeof(T).Name,
			formatter(state, exception),
			CapturingLoggerState.Capture(state),
			exception
		));
	}

	private sealed class NullScope : IDisposable {
		public static readonly NullScope Instance = new();

		public void Dispose() {
		}
	}
}

public sealed class CapturingLoggerProvider : ILoggerProvider {
	public List<CapturedLog> Entries { get; } = [];

	public IReadOnlyList<CapturedLog> Warnings {
		get {
			return Entries.Where(entry => entry.Level == LogLevel.Warning).ToList();
		}
	}

	public ILogger CreateLogger(string categoryName) {
		return new ProviderLogger(this, categoryName);
	}

	public void Dispose() {
	}

	private sealed class ProviderLogger(
		CapturingLoggerProvider provider,
		string categoryName
	) : ILogger {
		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return NullScope.Instance;
		}

		public bool IsEnabled(LogLevel logLevel) {
			return true;
		}

		public void Log<TState>(
			LogLevel logLevel,
			EventId eventId,
			TState state,
			Exception? exception,
			Func<TState, Exception?, string> formatter
		) {
			provider.Entries.Add(new CapturedLog(
				logLevel,
				categoryName,
				formatter(state, exception),
				CapturingLoggerState.Capture(state),
				exception
			));
		}
	}

	private sealed class NullScope : IDisposable {
		public static readonly NullScope Instance = new();

		public void Dispose() {
		}
	}
}

internal static class CapturingLoggerState {
	public static IReadOnlyList<KeyValuePair<string, object?>> Capture<TState>(TState state) {
		return state is IEnumerable<KeyValuePair<string, object?>> values
			? values.ToList()
			: [];
	}
}
