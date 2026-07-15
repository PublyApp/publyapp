using System.Text.RegularExpressions;

using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// Shared query-filter parsing and validator allowlists for every endpoint that
/// filters tenant users by search/status/level — currently the list
/// (<c>FindTenantUsersAsStaff</c>) and export (<c>ExportTenantUsersAsStaff</c>)
/// endpoints. Keeping this in one place means a new <see cref="TenantUserStatus"/>
/// or <see cref="AccountLevel"/> member is accepted by every consumer instead of
/// silently 422ing on the endpoints whose allowlist wasn't updated.
/// </summary>
public static partial class TenantUserFilterQuery {
	// Source of truth: nameof() - rename-safe, no hardcoded strings to maintain.
	private static readonly string[] AllowedStatuses = [
		nameof(TenantUserStatus.Active),
		nameof(TenantUserStatus.Suspended),
		nameof(TenantUserStatus.GloballySuspended),
	];

	// Snake-case the PascalCase enum member names once at type init. The wire
	// contract uses snake_case tokens (e.g. "globally_suspended"); collapsing to
	// lowercase via .ToLowerInvariant() would yield "globallysuspended" and
	// break the existing wire format. Both the comparison set and the display
	// string derive from the same conversion so they stay in sync.
	[GeneratedRegex("(?<!^)([A-Z])")]
	private static partial Regex SnakeCaseBoundaryRegex();

	private static string ToSnakeCase(string value) {
		return SnakeCaseBoundaryRegex().Replace(value, "_$1").ToLowerInvariant();
	}

	public static readonly HashSet<string> AllowedStatusSet =
		new(AllowedStatuses.Select(ToSnakeCase), StringComparer.OrdinalIgnoreCase);

	public static readonly string AllowedStatusesDisplay =
		string.Join(", ", AllowedStatuses.Select(ToSnakeCase).Order());

	// AccountLevel members are single-word (Admin, User), so plain ToLowerInvariant is safe here
	// (unlike the multi-word TenantUserStatus set above, which needs the snake-case helper).
	private static readonly string[] AllowedLevels = [
		nameof(AccountLevel.Admin),
		nameof(AccountLevel.User),
	];

	public static readonly HashSet<string> AllowedLevelSet =
		new(AllowedLevels, StringComparer.OrdinalIgnoreCase);

	public static readonly string AllowedLevelsDisplay =
		string.Join(", ", AllowedLevels.Select(s => s.ToLowerInvariant()).Order());

	public static string? NormalizeSearch(string? search) {
		if (search is null) {
			return null;
		}

		var trimmed = search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public static IReadOnlySet<TenantUserStatus>? ParseStatuses(string? status) {
		if (status is null) {
			return null;
		}

		var trimmed = status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<TenantUserStatus>();
		foreach (var part in parts) {
			TenantUserStatus? parsed = UserAccount.ParseTenantStatus(part);
			if (parsed is { } parsedStatus) {
				statuses.Add(parsedStatus);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}

	public static IReadOnlySet<AccountLevel>? ParseLevels(string? level) {
		if (level is null) {
			return null;
		}

		var trimmed = level.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var levels = new HashSet<AccountLevel>();
		foreach (var part in parts) {
			AccountLevel? parsed = UserAccount.ParseLevel(part);
			if (parsed is { } parsedLevel) {
				levels.Add(parsedLevel);
			}
		}

		return levels.Count > 0 ? levels : null;
	}
}
