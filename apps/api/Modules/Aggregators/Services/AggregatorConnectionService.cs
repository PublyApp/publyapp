using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Aggregators.Entities;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Aggregators.Services;

public abstract record SaveAggregatorKeyResult {
	public sealed record Saved(AggregatorConnection Connection) : SaveAggregatorKeyResult;

	public sealed record Rejected(string Cause) : SaveAggregatorKeyResult;

	public sealed record Unreachable(string Cause) : SaveAggregatorKeyResult;
}

public abstract record TestAggregatorKeyResult {
	public sealed record Checked(AggregatorConnection Connection) : TestAggregatorKeyResult;

	public sealed record NotFound() : TestAggregatorKeyResult;

	public sealed record Unreachable(string Cause) : TestAggregatorKeyResult;
}

public sealed record AggregatorListItem(
	AggregatorKind Kind,
	AggregatorMetadata Metadata,
	AggregatorConnection? Connection
);

/// <summary>
/// Save / test / remove an organisation's aggregator key. The key is checked with the
/// aggregator BEFORE it is stored, encrypted at write, and decrypted only inside
/// <see cref="TestAsync"/> for the duration of one call. Registered manually (not a
/// <c>[Service]</c>): it is a flow that talks to adapters.
/// </summary>
public sealed class AggregatorConnectionService {
	private const int _HintLength = 4;

	private readonly AppDbContext _Db;
	private readonly ICredentialProtector _Protector;
	private readonly IReadOnlyDictionary<AggregatorKind, IAggregatorAdapter> _Adapters;

	public AggregatorConnectionService(
		AppDbContext db,
		ICredentialProtector protector,
		IEnumerable<IAggregatorAdapter> adapters
	) {
		this._Db = db;
		this._Protector = protector;
		this._Adapters = adapters.ToDictionary(adapter => adapter.Kind);
	}

	public static string PurposeFor(AggregatorKind kind) {
		return $"aggregator-{AggregatorKindWire.Format(kind)}-v1";
	}

	public async Task<IReadOnlyList<AggregatorListItem>> FindAsync(CancellationToken cancellationToken) {
		this._Db.RequireTenantScope();
		var connections = await this._Db.AggregatorConnection
			.AsNoTracking()
			.Where(c => !c.IsDeleted)
			.ToListAsync(cancellationToken);
		return [.. this._Adapters.Values
			.OrderBy(adapter => adapter.Kind)
			.Select(adapter => new AggregatorListItem(
				adapter.Kind,
				adapter.Describe(),
				connections.FirstOrDefault(c => c.Kind == adapter.Kind)
			))];
	}

	public bool IsKnown(AggregatorKind kind) {
		return this._Adapters.ContainsKey(kind);
	}

	public async Task<SaveAggregatorKeyResult> SaveAsync(
		AggregatorKind kind,
		string apiKey,
		CancellationToken cancellationToken
	) {
		var tenantId = this._ScopedTenantId();
		var check = await this._Adapters[kind].CheckKeyAsync(apiKey, cancellationToken);
		if (check is KeyCheck.Rejected rejected) {
			return new SaveAggregatorKeyResult.Rejected(rejected.Cause);
		}

		if (check is KeyCheck.Unreachable unreachable) {
			return new SaveAggregatorKeyResult.Unreachable(unreachable.Cause);
		}

		var connection = await this._FindAsync(kind, cancellationToken);
		if (connection is null) {
			connection = new AggregatorConnection {
				TenantId = tenantId,
				Kind = kind,
				ProtectedApiKey = string.Empty,
				KeyHint = string.Empty,
			};
			this._Db.AggregatorConnection.Add(connection);
		}

		connection.ProtectedApiKey = this._Protector.Protect(apiKey, AggregatorConnectionService.PurposeFor(kind));
		connection.KeyHint = apiKey[Math.Max(0, apiKey.Length - AggregatorConnectionService._HintLength)..];
		connection.Status = AggregatorConnectionStatus.Active;
		connection.LastCheckedAt = DateTime.UtcNow;
		connection.LastError = null;
		await this._Db.SaveChangesAsync(cancellationToken);
		return new SaveAggregatorKeyResult.Saved(connection);
	}

	public async Task<TestAggregatorKeyResult> TestAsync(
		AggregatorKind kind,
		CancellationToken cancellationToken
	) {
		this._Db.RequireTenantScope();
		var connection = await this._FindAsync(kind, cancellationToken);
		if (connection is null) {
			return new TestAggregatorKeyResult.NotFound();
		}

		var key = this._Protector.Unprotect(connection.ProtectedApiKey, AggregatorConnectionService.PurposeFor(kind));
		var check = key.Outcome == UnprotectOutcome.Ok && key.Plaintext is not null
			? await this._Adapters[kind].CheckKeyAsync(key.Plaintext, cancellationToken)
			: new KeyCheck.Rejected("The stored key can no longer be read. Paste the key again.");
		if (check is KeyCheck.Unreachable unreachable) {
			return new TestAggregatorKeyResult.Unreachable(unreachable.Cause);
		}

		connection.LastCheckedAt = DateTime.UtcNow;
		connection.Status = check is KeyCheck.Rejected
			? AggregatorConnectionStatus.Invalid
			: AggregatorConnectionStatus.Active;
		connection.LastError = (check as KeyCheck.Rejected)?.Cause;
		await this._Db.SaveChangesAsync(cancellationToken);
		return new TestAggregatorKeyResult.Checked(connection);
	}

	/// <summary>Soft-deletes the row and erases the encrypted key. False when there was none.</summary>
	public async Task<bool> RemoveAsync(
		AggregatorKind kind,
		CancellationToken cancellationToken
	) {
		this._Db.RequireTenantScope();
		var connection = await this._FindAsync(kind, cancellationToken);
		if (connection is null) {
			return false;
		}

		connection.ProtectedApiKey = string.Empty;
		connection.IsDeleted = true;
		connection.DeletedAt = DateTime.UtcNow;
		await this._Db.SaveChangesAsync(cancellationToken);
		return true;
	}

	private Task<AggregatorConnection?> _FindAsync(AggregatorKind kind, CancellationToken cancellationToken) {
		return this._Db.AggregatorConnection.FirstOrDefaultAsync(
			c => c.Kind == kind && !c.IsDeleted,
			cancellationToken
		);
	}

	// RequireTenantScope throws when there is none, so the id is always set past it.
	private Guid _ScopedTenantId() {
		this._Db.RequireTenantScope();
		return this._Db.TenantId.GetValueOrDefault();
	}
}
