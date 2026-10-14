using Microsoft.Extensions.Logging;

namespace PublyApp.Api.Lib.Testing.Fakes;

public sealed record CapturedLog(
	LogLevel Level,
	string Category,
	string Message,
	IReadOnlyList<KeyValuePair<string, object?>> State,
	IReadOnlyList<object?> Scopes,
	Exception? Exception
);

public sealed class CapturingLogger<T> : ILogger<T> {
	private readonly CapturingLoggerScopes _Scopes = new();

	public List<CapturedLog> Entries { get; } = [];

	public IReadOnlyList<CapturedLog> Warnings {
		get {
			return this.Entries.Where(entry => entry.Level == LogLevel.Warning).ToList();
		}
	}

	public IDisposable BeginScope<TState>(TState state) where TState : notnull {
		return this._Scopes.Begin(state);
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
		this.Entries.Add(new CapturedLog(
			logLevel,
			typeof(T).FullName ?? typeof(T).Name,
			formatter(state, exception),
			CapturingLoggerState.Capture(state),
			this._Scopes.Current,
			exception
		));
	}
}

public sealed class CapturingLoggerProvider : ILoggerProvider {
	public List<CapturedLog> Entries { get; } = [];

	public IReadOnlyList<CapturedLog> Warnings {
		get {
			return this.Entries.Where(entry => entry.Level == LogLevel.Warning).ToList();
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
		private readonly CapturingLoggerScopes _Scopes = new();

		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return this._Scopes.Begin(state);
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
				this._Scopes.Current,
				exception
			));
		}
	}
}

internal sealed class CapturingLoggerScopes {
	private readonly AsyncLocal<IReadOnlyList<object?>> _Current = new();

	public IReadOnlyList<object?> Current {
		get { return this._Current.Value ?? []; }
	}

	public IDisposable Begin(object state) {
		var previous = this._Current.Value ?? [];
		this._Current.Value = previous.Append(state).ToArray();
		return new Scope(this, previous);
	}

	private sealed class Scope(
		CapturingLoggerScopes owner,
		IReadOnlyList<object?> previous
	) : IDisposable {
		private bool _Disposed;

		public void Dispose() {
			if (this._Disposed) {
				return;
			}

			this._Disposed = true;
			owner._Current.Value = previous;
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
