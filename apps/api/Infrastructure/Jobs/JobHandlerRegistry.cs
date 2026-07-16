using System.Diagnostics.CodeAnalysis;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Maps versioned <c>job_type</c> → <see cref="IJobHandler"/>. Registration is
/// explicit and fail-fast: a duplicate handler for the same job type throws at
/// construction rather than letting two handlers silently contend one key (design
/// §5.1). An unknown job type at dispatch time is a
/// <see cref="JobOutcome.PermanentFailure"/> straight to the DLQ — the engine owns
/// that classification; this registry only answers resolution. Handlers are
/// discovered from DI (every registered <see cref="IJobHandler"/>); for Phase 2A-R no
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

	/// <summary>
	/// Startup check (design §5.1, F14): warns when the DLQ holds job types no longer
	/// registered — a requeue of those rows would fail, so a version's handler must
	/// not have been removed while its jobs were still dead-lettered.
	/// </summary>
	public async Task LogUnregisteredDeadLetterTypesAsync(
		AppDbContext dbContext,
		ILogger logger,
		CancellationToken cancellationToken
	) {
		var deadLetterTypes = await dbContext.JobDeadLetter
			.Select(d => d.JobType)
			.Distinct()
			.ToListAsync(cancellationToken);

		var orphaned = deadLetterTypes
			.Where(t => !_handlers.ContainsKey(t))
			.ToList();

		if (orphaned.Count > 0 && logger.IsEnabled(LogLevel.Warning)) {
			logger.LogWarning(
				"job_dead_letter contains job types with no registered handler "
				+ "(requeue would fail): {OrphanedJobTypes}",
				string.Join(", ", orphaned)
			);
		}
	}
}
