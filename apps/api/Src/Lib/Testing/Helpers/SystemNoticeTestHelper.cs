namespace MainApi.Src.Lib.Testing.Helpers;

using System.Net.Http.Json;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;

internal static class SystemNoticeTestHelper {
	private static readonly string CreateUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.SystemNotices.ForStaff.Root,
		Routes.SystemNotices.ForStaff.Create
	);

	public static async Task<Guid> CreateNoticeAsync(
		HttpClient http,
		string staffToken,
		string severity = "info",
		string title = "Test Notice",
		string message = "Test message body",
		string? startsAt = null,
		string? expiresAt = null,
		CancellationToken ct = default
	) {
		var effectiveStartsAt = startsAt
			?? DateTime.UtcNow
				.AddMinutes(-5)
				.ToString("o");

		object body = expiresAt is not null
			? new {
				severity,
				title,
				message,
				startsAt = effectiveStartsAt,
				expiresAt
			}
			: new {
				severity,
				title,
				message,
				startsAt = effectiveStartsAt
			};

		var request = new HttpRequestMessage(
			HttpMethod.Post, CreateUrl
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(body);

		using var response =
			await http.SendAsync(request, ct);

		if (!response.IsSuccessStatusCode) {
			var errorBody =
				await response.Content
					.ReadAsStringAsync(ct);
			throw new InvalidOperationException(
				"Create notice failed with status "
				+ $"{(int)response.StatusCode}: "
				+ errorBody
			);
		}

		var result = await response.Content
			.ReadFromJsonAsync<NoticeCreatedResponse>(ct);

		if (result is null) {
			throw new InvalidOperationException(
				"Create notice returned null or no ID"
			);
		}
		return result.Id;
	}

	public static async Task DeleteNoticeAsync(
		HttpClient http,
		string staffToken,
		Guid noticeId,
		CancellationToken ct = default
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.SystemNotices.ForStaff.Root,
			Routes.SystemNotices.ForStaff.DeleteFn(
				noticeId.ToString()
			)
		);

		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await http.SendAsync(request, ct);
		// Best-effort deletion — ignore errors
	}

	public static string GetNoticeUrl(Guid noticeId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.SystemNotices.ForStaff.Root,
			Routes.SystemNotices.ForStaff.GetByIdFn(
				noticeId.ToString()
			)
		);
	}

	private record NoticeCreatedResponse {
		public Guid Id { get; init; }
	}
}
