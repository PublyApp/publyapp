using FluentValidation;

namespace MainApi.Src.Lib.Validation;

public class OffsetPaginatedQueryValidator<T>
	: AbstractValidator<T> where T : OffsetPaginatedQuery {
	public OffsetPaginatedQueryValidator() {
		RuleFor(x => x.Page)
			.Must(PaginationPredicates
				.BeValidNullableNumber)
			.WithMessage(
				"page must be a valid number "
				+ "greater than or equal to 1"
			);

		RuleFor(x => x.Limit)
			.Must(PaginationPredicates
				.BeValidNullableNumber)
			.WithMessage(
				"limit must be a valid number "
				+ "greater than or equal to 1"
			);

		RuleFor(x => x.SortId)
			.Must(PaginationPredicates
				.BeValidNullableString)
			.WithMessage(
				"sort_id must be a valid string"
			);

		RuleFor(x => x.SortOrder)
			.Must(PaginationPredicates
				.BeValidNullableSort)
			.WithMessage(
				"sort_order must equal 'asc' or 'desc'"
			);
	}
}
