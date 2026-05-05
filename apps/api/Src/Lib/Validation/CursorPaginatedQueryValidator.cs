using FluentValidation;

namespace MainApi.Src.Lib.Validation;

public class CursorPaginatedQueryValidator<T>
	: AbstractValidator<T>
	where T : CursorPaginatedQuery {
	public CursorPaginatedQueryValidator() {
		RuleFor(x => x.Cursor)
			.Must(PaginationPredicates
				.BeValidNullableString)
			.WithMessage(
				"Cursor must be a valid string"
			);

		RuleFor(x => x.Limit)
			.Must(PaginationPredicates
				.BeValidNullableNumber)
			.WithMessage(
				"Limit must be a valid number "
				+ "greater than or equal to 1"
			);

		RuleFor(x => x.SortId)
			.Must(PaginationPredicates
				.BeValidNullableString)
			.WithMessage(
				"SortId must be a valid string"
			);

		RuleFor(x => x.SortOrder)
			.Must(PaginationPredicates
				.BeValidNullableSort)
			.WithMessage(
				"SortOrder must equal 'asc' or 'desc'"
			);
	}
}
