using System.Diagnostics.CodeAnalysis;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// One registered job kind: its versioned <c>job_type</c> plus a factory that
/// resolves the handler from a PER-JOB service scope. Handlers register as SCOPED
/// services (via <c>JobsServiceRegistration.AddJobHandler</c>), so they can inject
/// AppDbContext like any domain service — the registry never captures instances, so
/// no scoped dependency is ever root-captured and DI scope validation passes.
/// </summary>
public sealed record JobHandlerRegistration(
	string JobType,
	Func<IServiceProvider, IJobHandler> Factory
);

/// <summary>
/// Maps versioned <c>job_type</c> → <see cref="JobHandlerRegistration"/>.
/// Registration is explicit and fail-fast: a duplicate registration for the same job
/// type throws at construction rather than letting two handlers silently contend one
/// key (design §5.1). An unknown job type at dispatch time is a
/// <see cref="JobOutcome.PermanentFailure"/> straight to the DLQ — the engine owns
/// that classification; this registry only answers resolution. For Phase 2A-R no
/// domain handlers exist yet, so the registry is legitimately empty at runtime.
/// </summary>
public sealed class JobHandlerRegistry {
	private readonly Dictionary<string, JobHandlerRegistration> _registrations;

	public JobHandlerRegistry(IEnumerable<JobHandlerRegistration> registrations) {
		_registrations = new Dictionary<string, JobHandlerRegistration>(StringComparer.Ordinal);

		foreach (var registration in registrations) {
			if (_registrations.ContainsKey(registration.JobType)) {
				throw new InvalidOperationException(
					$"Duplicate job handler registered for job type '{registration.JobType}'. "
					+ "Each job_type must map to exactly one handler."
				);
			}

			_registrations.Add(registration.JobType, registration);
		}
	}

	public bool TryResolve(
		string jobType,
		[NotNullWhen(true)] out JobHandlerRegistration? registration
	) {
		return _registrations.TryGetValue(jobType, out registration);
	}

	public IReadOnlyCollection<string> RegisteredJobTypes {
		get { return _registrations.Keys.ToList(); }
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
		var deadLetterTypes = await (
			from deadLetter in dbContext.JobDeadLetter
			select deadLetter.JobType
		).Distinct().ToListAsync(cancellationToken);

		var orphaned = deadLetterTypes
			.Where(t => !_registrations.ContainsKey(t))
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
