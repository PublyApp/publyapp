using System.Globalization;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.Dashboard.Services;
using PublyApp.Api.Modules.Dashboard.Validation;

namespace PublyApp.Api.Modules.Dashboard.Handlers.Staff;

public class FindTopOrganisationsForStaffQuery
	: IDashboardWindowQuery {
	[FromQuery(Name = "start_date")] public string? StartDate { get; set; }
	[FromQuery(Name = "end_date")] public string? EndDate { get; set; }
	[FromQuery(Name = "size")] public string? Size { get; set; }

	public int GetSize() {
		if (string.IsNullOrWhiteSpace(this.Size)) {
			return DashboardQueryRules.DefaultTopOrganisationsSize;
		}

		if (!int.TryParse(this.Size, out var size)) {
			throw new ArgumentException(
				"size must be a valid number",
				nameof(this.Size)
			);
		}

		return size;
	}
}

public class FindTopOrganisationsForStaffQueryValidator
	: DashboardWindowQueryValidator<FindTopOrganisationsForStaffQuery> {
	public FindTopOrganisationsForStaffQueryValidator() {
		this.RuleFor(x => x.Size)
			.Must(DashboardQueryRules.BeValidSize)
			.WithMessage(
				"size must be a valid number between 1 and "
				+ DashboardQueryRules.MaxTopOrganisationsSize
			);
	}
}

public sealed class FindTopOrganisationsForStaffResponse {
	public required string StartDate { get; init; }
	public required string EndDate { get; init; }
	public required IReadOnlyList<TopOrganisationItem> Items {
		get; init;
	}
}

public sealed class FindTopOrganisationsForStaff {
	public static async Task<
		Ok<FindTopOrganisationsForStaffResponse>
	> Handle(
		[AsParameters]
		FindTopOrganisationsForStaffQuery query,
		[FromServices]
		IDashboardQueryService dashboardQueryService,
		CancellationToken cancellationToken = default
	) {
		if (!DashboardQueryRules.TryParseWindow(
			query.StartDate,
			query.EndDate,
			out var start,
			out var end
		)) {
			throw new InvalidOperationException(
				"Top organisations window passed validation "
				+ "but could not be parsed."
			);
		}

		var items =
			await dashboardQueryService.FindTopOrganisationsAsync(
				new FindTopOrganisationsArgs(
					start,
					end,
					query.GetSize()
				),
				cancellationToken
			);

		return TypedResults.Ok(
			new FindTopOrganisationsForStaffResponse {
				StartDate = start.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				EndDate = end.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				Items = items,
			}
		);
	}
}
