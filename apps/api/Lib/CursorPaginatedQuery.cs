using Microsoft.AspNetCore.Mvc;

namespace PublyApp.Api.Lib;

public class CursorPaginatedQuery {
	[FromQuery(Name = "cursor")] public string? Cursor { get; set; }
	[FromQuery(Name = "limit")] public string? Limit { get; set; }
	[FromQuery(Name = "sort_id")] public string? SortId { get; set; }
	[FromQuery(Name = "sort_order")] public string? SortOrder { get; set; }

	public string? GetCursor() {
		if (Cursor is null) {
			return null;
		}

		return Cursor;
	}

	public int? GetLimit() {
		if (Limit is null) {
			return null;
		}

		if (!int.TryParse(Limit, out var limit)) {
			throw new ArgumentException("Limit must be a valid number", nameof(Limit));
		}

		return limit;
	}

	public string? GetSortId() {
		if (SortId is null) {
			return null;
		}

		return SortId;
	}

	public SortOrder GetSortOrder() {
		if (SortOrder is null) {
			return Lib.SortOrder.Desc;
		}

		if (
			!SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)
			&& !SortOrder.Equals("desc", StringComparison.OrdinalIgnoreCase)
		) {
			throw new ArgumentException("SortOrder must equal 'asc' or 'desc'", nameof(SortOrder));
		}

		if (SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)) {
			return Lib.SortOrder.Asc;
		} else {
			return Lib.SortOrder.Desc;
		}
	}
}
