using FluentValidation;

namespace PublyApp.Api.Lib.Validation;

public class OffsetPaginatedQueryValidator<T>
	: AbstractValidator<T> where T : OffsetPaginatedQuery {
	public OffsetPaginatedQueryValidator() {
		this.RuleFor(x => x.Page)
			.Must(PaginationPredicates
				.BeValidNullableNumber)
			.WithMessage(
				"page must be a valid number "
				+ "greater than or equal to 1"
			);

		this.RuleFor(x => x.Limit)
			.Must(PaginationPredicates
				.BeValidNullableLimit)
			.WithMessage(
				"limit must be a valid number "
				+ "between 1 and "
				+ AppEnvironment.Instance.PAGINATION_MAX_LIMIT
			);

		this.RuleFor(x => x.SortId)
			.Must(PaginationPredicates
				.BeValidNullableString)
			.WithMessage(
				"sort_id must be a valid string"
			);

		this.RuleFor(x => x.SortOrder)
			.Must(PaginationPredicates
				.BeValidNullableSort)
			.WithMessage(
				"sort_order must equal 'asc' or 'desc'"
			);
	}
}
