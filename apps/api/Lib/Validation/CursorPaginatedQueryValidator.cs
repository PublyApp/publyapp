using FluentValidation;

namespace PublyApp.Api.Lib.Validation;

public class CursorPaginatedQueryValidator<T>
	: AbstractValidator<T>
	where T : CursorPaginatedQuery {
	public CursorPaginatedQueryValidator() {
		RuleFor(x => x.Cursor)
			.Must(PaginationPredicates
				.BeValidNullableString)
			.WithMessage(
				"cursor must be a valid string"
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
