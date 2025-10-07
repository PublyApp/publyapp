using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Lib;

public class PaginatedQuery {
	[FromQuery] public string? Page { get; set; }
	[FromQuery] public string? Limit { get; set; }
	[FromQuery] public string? SortId { get; set; }
	[FromQuery] public string? SortOrder { get; set; }

	public int? GetPage() {
		if (Page is null) {
			return null;
		}

		if (!int.TryParse(Page, out var page)) {
			throw new Exception("Page must be a valid number");
		}
		return page;
	}

	public int? GetLimit() {
		if (Limit is null) {
			return null;
		}

		if (!int.TryParse(Limit, out var limit)) {
			throw new Exception("Limit must be a valid number");
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
			throw new Exception("SortOrder must equal 'asc' or 'desc'");
		}

		return SortOrder == "asc"
			? Lib.SortOrder.Asc
			: Lib.SortOrder.Desc;
	}
}

