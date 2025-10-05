using FluentValidation;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.StaffMember.Handlers;

public class StaffMemberItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public UserStatus Status { get; set; } = UserStatus.Inactive;
}

public class FindStaffMembersResult {
	public required List<StaffMemberItem> StaffMembers { get; set; }
	public required int Count { get; set; }
}

public class FindStaffMembersQuery {
	[FromQuery] public string? Page { get; set; }
	[FromQuery] public string? PageSize { get; set; }

	public int? GetPage() {
		if (Page is null) {
			return null;
		}

		if (!int.TryParse(Page, out var page)) {
			throw new Exception("Page must be a valid number");
		}
		return page;
	}

	public int? GetPageSize() {
		if (PageSize is null) {
			return null;
		}

		if (!int.TryParse(PageSize, out var pageSize)) {
			throw new Exception("PageSize must be a valid number");
		}
		return pageSize;
	}
}

public class FindStaffMembersQueryValidator : AbstractValidator<FindStaffMembersQuery> {
	public FindStaffMembersQueryValidator() {
		RuleFor(x => x.Page)
			.Must(BeValidNullableNumber)
			.WithMessage("Page must be a valid number greater than or equal to 1");

		RuleFor(x => x.PageSize)
			.Must(BeValidNullableNumber)
			.WithMessage("PageSize must be a valid number greater than or equal to 1");
	}

	private static bool BeValidNullableNumber(string? value) {
		if (value is null) {
			return true;
		}

		return int.TryParse(value, out var num) && num >= 1;
	}
}

public class FindStaffMembers {
	public static async Task<
		Results<
			Ok<FindStaffMembersResult>,
			BadRequest<ApiResponse>
		>
	> HandleFindStaffMembers(
		[AsParameters] FindStaffMembersQuery findStaffMembersQuery,
		[FromServices] IStaffMemberService staffMemberService,
		CancellationToken cancellationToken
	) {
		var page = findStaffMembersQuery.GetPage();
		var pageSize = findStaffMembersQuery.GetPageSize();

		var countTask = staffMemberService.CountStaffMembersAsync(cancellationToken);

		var staffMembersTask = staffMemberService.FindStaffMembersAsync(
			page: page,
			pageSize: pageSize,
			cancellationToken: cancellationToken
		);

		await Task.WhenAll(countTask, staffMembersTask).ConfigureAwait(false);

		var count = await countTask;
		var staffMembers = await staffMembersTask;

		return TypedResults.Ok(
			new FindStaffMembersResult {
				StaffMembers = staffMembers
					.Select(staffMember => new StaffMemberItem {
						Id = staffMember.Id,
						Email = staffMember.Email,
					})
					.ToList(),
				Count = count,
			}
		);
	}
}
