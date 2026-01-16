using MainApi.Src.Data.DbContext;
using MainApi.Src.Modules.SystemNotices.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.SystemNotices.Services;

public interface ISystemNoticeService {
	Task<SystemNotice> CreateAsync(
		NoticeSeverity severity,
		string title,
		string message,
		DateTime startsAt,
		DateTime? expiresAt,
		Guid createdByStaffId,
		CancellationToken cancellationToken = default);

	Task<(List<SystemNoticeListItem> Items, int TotalCount)> FindAsync(
		int page,
		int pageSize,
		CancellationToken cancellationToken = default);

	Task<SystemNotice?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default);

	Task<SystemNotice?> UpdateAsync(
		Guid id,
		NoticeSeverity? severity,
		string? title,
		string? message,
		DateTime? startsAt,
		DateTime? expiresAt,
		CancellationToken cancellationToken = default);

	Task<bool> DeleteAsync(
		Guid id,
		CancellationToken cancellationToken = default);

	Task<List<ActiveSystemNotice>> GetActiveAsync(
		CancellationToken cancellationToken = default);
}

public record SystemNoticeListItem {
	public required Guid Id { get; init; }
	public required string Severity { get; init; }
	public required string Title { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
	public required bool IsActive { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public record ActiveSystemNotice {
	public required Guid Id { get; init; }
	public required string Severity { get; init; }
	public required string Title { get; init; }
	public required string Message { get; init; }
	public DateTime? ExpiresAt { get; init; }
}

public class SystemNoticeService : ISystemNoticeService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<SystemNoticeService> _logger;

	public SystemNoticeService(
		MainApiDbContext dbContext,
		ILogger<SystemNoticeService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<SystemNotice> CreateAsync(
		NoticeSeverity severity,
		string title,
		string message,
		DateTime startsAt,
		DateTime? expiresAt,
		Guid createdByStaffId,
		CancellationToken cancellationToken = default
	) {
		var notice = new SystemNotice {
			Severity = severity,
			Title = title,
			Message = message,
			StartsAt = startsAt,
			ExpiresAt = expiresAt,
			CreatedByStaffId = createdByStaffId
		};

		await _dbContext.SystemNotice.AddAsync(notice, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created system notice {NoticeId} with severity {Severity} by staff {StaffId}",
				notice.Id,
				severity,
				createdByStaffId
			);
		}

		return notice;
	}

	public async Task<(List<SystemNoticeListItem> Items, int TotalCount)> FindAsync(
		int page,
		int pageSize,
		CancellationToken cancellationToken = default
	) {
		var baseQuery =
			from n in _dbContext.SystemNotice
			orderby n.CreatedAt descending
			select n;

		var totalCount = await baseQuery.CountAsync(cancellationToken);

		var notices = await baseQuery
			.Skip((page - 1) * pageSize)
			.Take(pageSize)
			.ToListAsync(cancellationToken);

		var items = notices.Select(n => new SystemNoticeListItem {
			Id = n.Id!.Value,
			Severity = n.Severity.ToString().ToLowerInvariant(),
			Title = n.Title,
			StartsAt = n.StartsAt,
			ExpiresAt = n.ExpiresAt,
			IsActive = n.IsActive(),
			CreatedAt = n.CreatedAt
		}).ToList();

		return (items, totalCount);
	}

	public async Task<SystemNotice?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var noticeQuery =
			from n in _dbContext.SystemNotice
			where n.Id == id
			select n;

		return await noticeQuery.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<SystemNotice?> UpdateAsync(
		Guid id,
		NoticeSeverity? severity,
		string? title,
		string? message,
		DateTime? startsAt,
		DateTime? expiresAt,
		CancellationToken cancellationToken = default
	) {
		var notice = await _dbContext.SystemNotice
			.FindAsync(new object[] { id }, cancellationToken);

		if (notice is null) {
			return null;
		}

		if (severity.HasValue) {
			notice.Severity = severity.Value;
		}
		if (title is not null) {
			notice.Title = title;
		}
		if (message is not null) {
			notice.Message = message;
		}
		if (startsAt.HasValue) {
			notice.StartsAt = startsAt.Value;
		}
		// ExpiresAt can be explicitly set to null, so we check differently
		notice.ExpiresAt = expiresAt;

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Updated system notice {NoticeId}",
				id
			);
		}

		return notice;
	}

	public async Task<bool> DeleteAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var notice = await _dbContext.SystemNotice
			.FindAsync(new object[] { id }, cancellationToken);

		if (notice is null) {
			return false;
		}

		// Soft delete via BaseAttributes
		notice.IsDeleted = true;
		notice.DeletedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Deleted system notice {NoticeId}",
				id
			);
		}

		return true;
	}

	public async Task<List<ActiveSystemNotice>> GetActiveAsync(
		CancellationToken cancellationToken = default
	) {
		var now = DateTime.UtcNow;

		var activeNoticesQuery =
			from n in _dbContext.SystemNotice
			where n.IsDeleted == false
				&& n.StartsAt <= now
				&& (n.ExpiresAt == null || n.ExpiresAt > now)
			orderby n.Severity descending, n.StartsAt descending
			select new ActiveSystemNotice {
				Id = n.Id!.Value,
				Severity = n.Severity.ToString().ToLowerInvariant(),
				Title = n.Title,
				Message = n.Message,
				ExpiresAt = n.ExpiresAt
			};

		return await activeNoticesQuery.ToListAsync(cancellationToken);
	}
}
