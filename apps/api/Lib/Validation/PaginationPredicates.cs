namespace PublyApp.Api.Lib.Validation;

public static class PaginationPredicates {
	public static bool BeValidNullableString(
		string? value
	) {
		if (value is null) {
			return true;
		}

		return !string.IsNullOrEmpty(value);
	}

	public static bool BeValidNullableSort(
		string? value
	) {
		if (value is null) {
			return true;
		}

		return (
			value.Equals(
				"asc",
				StringComparison.OrdinalIgnoreCase
			)
			|| value.Equals(
				"desc",
				StringComparison.OrdinalIgnoreCase
			)
		);
	}

	public static bool BeValidNullableNumber(
		string? value
	) {
		if (value is null) {
			return true;
		}

		return int.TryParse(value, out var num)
			&& num >= 1;
	}

	public static bool BeValidNullableLimit(
		string? value
	) {
		if (value is null) {
			return true;
		}

		return int.TryParse(value, out var num)
			&& num >= 1
			&& num <= AppEnvironment.Instance.PAGINATION_MAX_LIMIT;
	}
}
