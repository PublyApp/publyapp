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
		ThrowIfUnstampedRawStatusWrite(result, eventData);
		return result;
	}

	// ExecuteSqlRawAsync / FromSqlAsync do NOT route through the creation hook:
	// the round-1 code implemented only CommandCreated, so every asynchronous
	// raw command slipped past unchecked (the plain-UPDATE control in
	// PublicationStatusWriteGuardSpec ran RED against that code). Raw commands
	// are intercepted at execution time instead, on BOTH the synchronous and
	// asynchronous paths, via the *Executing callbacks below. All three command
	// shapes (non-query, reader, scalar) share one check so a status flip
	// cannot hide behind a different execution entrypoint.
	private static void ThrowIfUnstampedRawStatusWrite(
		DbCommand command,
		CommandEventData eventData
	) {
		if (UpdatesPublicationsStatus(command.CommandText)
			&& !HasStamp(eventData.Context)) {
			throw new PublicationStatusGuardException(
				"Raw SQL attempted to change the status column of the publications "
					+ "table outside PublicationStatusTransitionService; this write was "
					+ "not written through the transition service "
					+ "(PublicationStatusTransitionService is the only Status writer, #1446)."
			);
		}
	}

	public InterceptionResult<int> NonQueryExecuting(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<int> result
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return result;
	}

	public ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<int> result,
		CancellationToken cancellationToken = default
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return ValueTask.FromResult(result);
	}

	public InterceptionResult<DbDataReader> ReaderExecuting(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<DbDataReader> result
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return result;
	}

	public ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<DbDataReader> result,
		CancellationToken cancellationToken = default
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return ValueTask.FromResult(result);
	}

	public InterceptionResult<object> ScalarExecuting(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<object> result
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return result;
	}

	public ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
		DbCommand command,
		CommandEventData eventData,
		InterceptionResult<object> result,
		CancellationToken cancellationToken = default
	) {
		ThrowIfUnstampedRawStatusWrite(command, eventData);
		return ValueTask.FromResult(result);
	}

	/// <summary>
	/// True when <paramref name="commandText"/> contains an UPDATE against the
	/// publications table whose SET list assigns the status column, in ANY
	/// statement position: the matcher is deliberately NOT anchored at the
	/// start of the statement (r2: a leading <c>WITH</c> CTE or block comment
	/// defeated the round-1 <c>^</c> anchor), per-statement on purpose (EF
	/// batches updates with semicolons — one whole-text match would miss the
	/// second statement's crimes), and its SET list runs to WHERE/FROM/
	/// RETURNING, a semicolon, or end-of-text (r2: where-less bulk updates
	/// have no clause terminator). SQL comments are stripped before matching
	/// so text that merely QUOTES an update inside a comment cannot satisfy
	/// the now-unanchored matcher. A rare false positive fails loud here;
	/// silence would fail open.
	/// </summary>
	private static bool UpdatesPublicationsStatus(string commandText) {
		foreach (var statement in commandText.Split(';')) {
			if (!PublicationsTableWord.IsMatch(statement)) {
				continue;
			}

			// Every UPDATE occurrence, not just the first: a data-modifying CTE
			// ("WITH c AS (UPDATE posts SET ... RETURNING ...) UPDATE
			// publications SET status = ...") hides the crime behind an earlier
			// innocent UPDATE whose own SET list never mentions status; a single
			// lazy Match stops there and fails open.
			foreach (Match match in UpdateStatementShape.Matches(
						StripSqlComments(statement)
					)) {
				if (StatusColumnWord.IsMatch(match.Groups["setList"].Value)) {
					return true;
				}
			}
		}

		return false;
	}

	// Comments are not executable, so removing them before shape matching can
	// never hide a real statement; it only stops quoted text inside comments
	// from impersonating one under the unanchored matcher.
	private static string StripSqlComments(string sql) {
		return SqlBlockComment.Replace(SqlLineComment.Replace(sql, " "), " ");
	}

	[GeneratedRegex(
		@"\bUPDATE\b.*?\bSET\b(?<setList>.*?)(?:\b(?:WHERE|FROM|RETURNING)\b|$)",
		RegexOptions.Singleline | RegexOptions.IgnoreCase
	)]
	private static partial Regex UpdateStatementShape { get; }

	[GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
	private static partial Regex SqlBlockComment { get; }

	[GeneratedRegex(@"--[^\r\n]*")]
	private static partial Regex SqlLineComment { get; }

	[GeneratedRegex(@"\bpublications\b", RegexOptions.IgnoreCase)]
	private static partial Regex PublicationsTableWord { get; }

	[GeneratedRegex(@"\bstatus\b", RegexOptions.IgnoreCase)]
	private static partial Regex StatusColumnWord { get; }
}
