using System.Diagnostics.CodeAnalysis;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Maps <c>job_type</c> → <see cref="IJobHandler"/>. Registration is explicit and
/// fail-fast: a duplicate handler for the same job type throws at construction rather
/// than letting two handlers silently contend one key (design §5.1). Handlers are
/// discovered from DI (every registered <see cref="IJobHandler"/>); for Phase 2A no
/// domain handlers exist yet, so the registry is legitimately empty at runtime.
/// </summary>
public sealed class JobHandlerRegistry {
	private readonly Dictionary<string, IJobHandler> _handlers;

	public JobHandlerRegistry(IEnumerable<IJobHandler> handlers) {
		_handlers = new Dictionary<string, IJobHandler>(StringComparer.Ordinal);

		foreach (var handler in handlers) {
			if (_handlers.ContainsKey(handler.JobType)) {
				throw new InvalidOperationException(
					$"Duplicate job handler registered for job type '{handler.JobType}'. "
					+ "Each job_type must map to exactly one handler."
				);
			}

			_handlers.Add(handler.JobType, handler);
		}
	}

	public bool TryResolve(string jobType, [NotNullWhen(true)] out IJobHandler? handler) {
		return _handlers.TryGetValue(jobType, out handler);
	}

	public IReadOnlyCollection<string> RegisteredJobTypes {
		get { return _handlers.Keys.ToList(); }
	}
}
