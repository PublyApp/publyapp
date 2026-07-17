using System.Diagnostics;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <inheritdoc cref="IJobEnqueuer"/>
public sealed class JobEnqueuer : IJobEnqueuer {
	private readonly AppDbContext _dbContext;
	private readonly IRequestAuthContext _authContext;

	public JobEnqueuer(AppDbContext dbContext, IRequestAuthContext authContext) {
		_dbContext = dbContext;
		_authContext = authContext;
	}

	public async Task<Guid> EnqueueAsync<TPayload>(
		JobDefinition<TPayload> definition,
		TPayload payload,
		EnqueueOptions? options = null,
		CancellationToken cancellationToken = default
	) {
		GuardDefinitionPolicy(definition);
		definition.ValidatePayload(payload);

		var item = new JobQueueItem {
			JobType = definition.JobType,
			Payload = JobJson.Serialize(payload),
			Priority = definition.Priority,
			MaxAttempts = definition.MaxAttempts,
			IdempotencyKey = options?.IdempotencyKey,
			// Provenance envelope (F15): trusted request identity when present,
			// current trace id for correlation. All null for system-originated work.
			TenantId = ParseTenantId(_authContext.TenantId),
			ActorUserId = _authContext.UserId,
			CorrelationId = Activity.Current?.Id
		};

		// Insert + NOTIFY must be one atomic unit: inside a caller-owned transaction
		// they join it (commit and wake happen together at the caller's commit);
		// with NO ambient transaction the enqueuer opens its own, so a NOTIFY
		// failure after the insert can never leave a durably-enqueued row whose
		// caller saw an exception (and would retry into a duplicate).
		var ownsTransaction = _dbContext.Database.CurrentTransaction is null;

		if (ownsTransaction) {
			await using var transaction =
				await _dbContext.Database.BeginTransactionAsync(cancellationToken);
			await InsertAndNotifyAsync(item, cancellationToken);
			await transaction.CommitAsync(cancellationToken);
		} else {
			await InsertAndNotifyAsync(item, cancellationToken);
		}

		if (item.Id is null) {
			throw new InvalidOperationException(
				"job_queue insert did not populate the database-generated id."
			);
		}

		return item.Id.Value;
	}

	private async Task InsertAndNotifyAsync(
		JobQueueItem item,
		CancellationToken cancellationToken
	) {
		await _dbContext.JobQueue.AddAsync(item, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		// Transactional wake (§5.5): delivered at commit, never for a rolled-back
		// write. Empty payload — the processor queries for eligible rows anyway.
		// Harmless until 2C's JobQueueListener exists (unheard NOTIFYs are dropped;
		// the poll interval remains the correctness fallback).
		await _dbContext.Database.ExecuteSqlAsync(
			$"SELECT pg_notify('job_queue', '')",
			cancellationToken
		);
	}

	// Defense-in-depth mirror of the §4.1 CHECK constraints, failing before SQL.
	private static void GuardDefinitionPolicy<TPayload>(JobDefinition<TPayload> definition) {
		if (definition.MaxAttempts is < 1 or > 50) {
			throw new InvalidOperationException(
				$"Job '{definition.JobType}' MaxAttempts must be between 1 and 50."
			);
		}

		if (definition.Priority is < 0 or > 1000) {
			throw new InvalidOperationException(
				$"Job '{definition.JobType}' Priority must be between 0 and 1000."
			);
		}
	}

	private static Guid? ParseTenantId(string? tenantId) {
		if (string.IsNullOrEmpty(tenantId)) {
			return null;
		}

		return Guid.TryParse(tenantId, out var parsed) ? parsed : null;
	}
}
