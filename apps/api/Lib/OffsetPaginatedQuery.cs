using Microsoft.AspNetCore.Mvc;

namespace PublyApp.Api.Lib;

public class OffsetPaginatedQuery {
	[FromQuery(Name = "page")] public string? Page { get; set; }
	[FromQuery(Name = "limit")] public string? Limit { get; set; }
	[FromQuery(Name = "sort_id")] public string? SortId { get; set; }
	[FromQuery(Name = "sort_order")] public string? SortOrder { get; set; }

	public int? GetPage() {
		if (Page is null) {
			return null;
		}

		if (!int.TryParse(Page, out var page)) {
			throw new ArgumentException("Page must be a valid number", nameof(Page));
		}
		return page;
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
