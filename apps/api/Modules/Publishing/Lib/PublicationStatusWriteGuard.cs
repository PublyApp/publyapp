using System.Data.Common;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Runtime half of the Publication.Status single-writer guard (#1446): the
/// Roslyn semantic walk (Lib/Architecture/PublicationArchitecture.Spec.cs)
/// cannot see a reflection writer (<c>GetProperty("Status").SetValue</c>) or
/// SQL assembled from pieces, so the DbContext itself refuses them at execution
/// time. Any tracked Status modification that
/// PublicationStatusTransitionService did not stamp, and any command text that
/// updates <c>publications.status</c> on an unstamped context, throws
/// <see cref="PublicationStatusGuardException"/> BEFORE anything reaches the
/// database. Wired in AppDbContext.OnConfiguring so EVERY context construction
/// path — DI, tests, the migrator, a bare <c>new AppDbContext(...)</c> —
/// carries it; there is no opt-out.
///
/// The stamp is deliberately unfalsifiable from production code: a private
/// <see cref="ConditionalWeakTable{DbContext, Object}"/> keyed by the context
/// instance, granted only through this class's internal member and revoked
/// after each completed save, so one grant covers exactly one save. No static
/// flags, no ambient state a caller could flip.
/// </summary>
internal sealed partial class PublicationStatusWriteGuard
	: ISaveChangesInterceptor,
		IDbCommandInterceptor {
	// Keyed by context instance; the token value is opaque and unreachable from
	// callers. Dies with the context, cannot be enumerated or shared.
	private static readonly ConditionalWeakTable<DbContext, object> SaveStamps = new();

	/// <summary>
	/// Legalise Status writes on <paramref name="context"/> for the NEXT save
	/// only (revoked on completion). Called exclusively by
	/// PublicationStatusTransitionService immediately before saving; internal
	/// visibility keeps every other production caller out at compile time.
	/// </summary>
	internal static void StampForStatusWrite(DbContext context) {
		// ConditionalWeakTable has no read-modify-write API; remove-then-add is
		// equivalent here because a stale grant was already revoked at save end.
		SaveStamps.Remove(context);
		SaveStamps.Add(context, new object());
	}

	private static bool HasStamp(DbContext? context) {
		return context is not null && SaveStamps.TryGetValue(context, out _);
	}

	private static void RevokeStamp(DbContext? context) {
		if (context is not null) {
			SaveStamps.Remove(context);
		}
	}

	/// <summary>
	/// Refuse every tracked Publication whose Status changed without the
	/// transition service's stamp. Runs ahead of the base save, so a refusal
	/// leaves the database untouched.
	/// </summary>
	private static void RejectUnstampedStatusWrites(DbContext context) {
		if (HasStamp(context)) {
			return;
		}

		foreach (var entry in context.ChangeTracker.Entries<Publication>()) {
			if (entry.State is not EntityState.Modified) {
				continue;
			}

			var statusProperty = entry.Property(publication => publication.Status);
			if (!statusProperty.IsModified) {
				continue;
			}

			throw PublicationStatusGuardException.ForTrackedWrite(
				entry.Entity.GetRequiredId(),
				statusProperty.OriginalValue,
				statusProperty.CurrentValue
			);
		}
	}

	public InterceptionResult<int> SavingChanges(
		DbContextEventData eventData,
		InterceptionResult<int> result
	) {
		if (eventData.Context is not null) {
			RejectUnstampedStatusWrites(eventData.Context);
		}

		return result;
	}

	public ValueTask<InterceptionResult<int>> SavingChangesAsync(
		DbContextEventData eventData,
		InterceptionResult<int> result,
		CancellationToken cancellationToken = default
	) {
		if (eventData.Context is not null) {
			RejectUnstampedStatusWrites(eventData.Context);
		}

		return ValueTask.FromResult(result);
	}

	public int SavedChanges(SaveChangesCompletedEventData eventData, int result) {
		RevokeStamp(eventData.Context);
		return result;
	}

	public ValueTask<int> SavedChangesAsync(
		SaveChangesCompletedEventData eventData,
		int result,
		CancellationToken cancellationToken = default
	) {
		RevokeStamp(eventData.Context);
		return ValueTask.FromResult(result);
	}

	public DbCommand CommandCreated(CommandEndEventData eventData, DbCommand result) {
		// EF's own UPDATE for a stamped Publication also carries "status" in its
		// SET clause, so raw SQL and tracked writes share the same stamp check.
		if (UpdatesPublicationsStatus(result.CommandText) && !HasStamp(eventData.Context)) {
			throw new PublicationStatusGuardException(
				"Raw SQL attempted to change the status column of the publications "
					+ "table outside PublicationStatusTransitionService; every Status "
					+ "change must be written through the transition service (#1446)."
			);
		}

		return result;
	}

	/// <summary>
	/// True when <paramref name="commandText"/> contains an UPDATE against the
	/// publications table whose SET list assigns the status column. Per-
	/// statement on purpose: EF batches updates with semicolons, and the SET
	/// list is bounded by WHERE/FROM/RETURNING so a status mention in another
	/// clause (or another table's update) never trips it. A rare false positive
	/// fails loud here; silence would fail open.
	/// </summary>
	private static bool UpdatesPublicationsStatus(string commandText) {
		foreach (var statement in commandText.Split(';')) {
			if (!PublicationsTableWord.IsMatch(statement)) {
				continue;
			}

			var match = UpdateStatementShape.Match(statement);
			if (match.Success && StatusColumnWord.IsMatch(match.Groups["setList"].Value)) {
				return true;
			}
		}

		return false;
	}

	[GeneratedRegex(
		@"^\s*UPDATE\b.*?\bSET\b(?<setList>.*?)\b(?:WHERE|FROM|RETURNING)\b",
		RegexOptions.Singleline | RegexOptions.IgnoreCase
	)]
	private static partial Regex UpdateStatementShape { get; }

	[GeneratedRegex(@"\bpublications\b", RegexOptions.IgnoreCase)]
	private static partial Regex PublicationsTableWord { get; }

	[GeneratedRegex(@"\bstatus\b", RegexOptions.IgnoreCase)]
	private static partial Regex StatusColumnWord { get; }
}
