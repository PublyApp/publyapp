using Microsoft.AspNetCore.Mvc;

namespace PublyApp.Api.Lib;

public class CursorPaginatedQuery {
	[FromQuery(Name = "cursor")] public string? Cursor { get; set; }
	[FromQuery(Name = "limit")] public string? Limit { get; set; }
	[FromQuery(Name = "sort_id")] public string? SortId { get; set; }
	[FromQuery(Name = "sort_order")] public string? SortOrder { get; set; }

	public string? GetCursor() {
		if (this.Cursor is null) {
			return null;
		}

		return this.Cursor;
	}

	public int? GetLimit() {
		if (this.Limit is null) {
			return null;
		}

		if (!int.TryParse(this.Limit, out var limit)) {
			throw new ArgumentException("Limit must be a valid number", nameof(this.Limit));
		}

		return limit;
	}

	public string? GetSortId() {
		if (this.SortId is null) {
			return null;
		}

		return this.SortId;
	}

	public SortOrder GetSortOrder() {
		if (this.SortOrder is null) {
			return Lib.SortOrder.Desc;
		}

		if (
			!this.SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)
			&& !this.SortOrder.Equals("desc", StringComparison.OrdinalIgnoreCase)
		) {
			throw new ArgumentException("SortOrder must equal 'asc' or 'desc'", nameof(this.SortOrder));
		}

		if (this.SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)) {
			return Lib.SortOrder.Asc;
		} else {
			return Lib.SortOrder.Desc;
		}
	}
}
