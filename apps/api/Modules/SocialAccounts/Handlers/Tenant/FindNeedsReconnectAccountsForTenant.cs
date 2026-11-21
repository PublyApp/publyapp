using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class FindNeedsReconnectAccountsForTenantResponse {
	public required IReadOnlyList<AccountItem> Accounts { get; init; }
}

public sealed record AccountItem(
	Guid Id,
	string DisplayHandle,
	string Provider,
	string? LastError
);

/// <summary>
/// Banner data path (C4): the calling tenant's accounts whose status is
/// NeedsReconnect, each with its stored sanitised cause. A foreign tenant's
/// rows are simply absent — 200 with an empty list, never a leak.
/// </summary>
public sealed class FindNeedsReconnectAccountsForTenant {
	public static async Task<Ok<FindNeedsReconnectAccountsForTenantResponse>> Handle(
		[FromServices] SocialAccountService socialAccountService,
		CancellationToken cancellationToken = default
	) {
		var accounts = await socialAccountService.FindNeedsReconnectAccountsAsync(
			cancellationToken
		);

		return TypedResults.Ok(new FindNeedsReconnectAccountsForTenantResponse {
			Accounts = accounts.Select(a => new AccountItem(
				a.Id,
				a.DisplayHandle,
				// Typed SocialProvider mapped end-to-end per #1443; the wire
				// formatter generalizes when a second provider lands.
				SocialAccountWire.FormatProvider(a.Provider),
				a.LastError
			)).ToList(),
		});
	}
}
