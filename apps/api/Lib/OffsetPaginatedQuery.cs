using Microsoft.AspNetCore.Mvc;

namespace PublyApp.Api.Lib;

public class OffsetPaginatedQuery {
	[FromQuery(Name = "page")] public string? Page { get; set; }
	[FromQuery(Name = "limit")] public string? Limit { get; set; }
	[FromQuery(Name = "sort_id")] public string? SortId { get; set; }
	[FromQuery(Name = "sort_order")] public string? SortOrder { get; set; }

	public int? GetPage() {
		if (this.Page is null) {
			return null;
		}

		if (!int.TryParse(this.Page, out var page)) {
			throw new ArgumentException("Page must be a valid number", nameof(this.Page));
		}
		return page;
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
