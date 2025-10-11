using FluentValidation;

namespace MainApi.Src.Lib;

public class PaginatedQueryValidator<T> : AbstractValidator<T> where T : PaginatedQuery {
	public PaginatedQueryValidator() {
		RuleFor(x => x.Page)
			.Must(BeValidNullableNumber)
			.WithMessage("Page must be a valid number greater than or equal to 1");

		RuleFor(x => x.Limit)
			.Must(BeValidNullableNumber)
			.WithMessage("Limit must be a valid number greater than or equal to 1");

		RuleFor(x => x.SortId)
			.Must(BeValidNullableString)
			.WithMessage("SortId must be a valid string");

		RuleFor(x => x.SortOrder)
			.Must(BeValidNullableSort)
			.WithMessage("SortOrder must equal 'asc' or 'desc'");
	}

	private static bool BeValidNullableString(string? value) {
		if (value is null) {
			return true;
		}

		return !string.IsNullOrEmpty(value);
	}

	private static bool BeValidNullableSort(string? value) {
		if (value is null) {
			return true;
		}

		return (
			value.Equals("asc", StringComparison.OrdinalIgnoreCase)
			|| value.Equals("desc", StringComparison.OrdinalIgnoreCase)
		);
	}

	private static bool BeValidNullableNumber(string? value) {
		if (value is null) {
			return true;
		}

		return int.TryParse(value, out var num) && num >= 1;
	}
}

