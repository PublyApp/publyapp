using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <summary>
	/// Repairs profile-link residue left by AddUserAccountMembershipUniqueness, which copied
	/// each dedup loser's links to the winner but never removed the loser's own links before
	/// soft-deleting that account. user_account_profiles is a pure junction table with no
	/// soft-delete state, so links owned by soft-deleted accounts remain live residue. The
	/// dedup migration is already applied in production and must remain historical truth;
	/// this separate forward migration repairs both existing and freshly migrated databases.
	/// </summary>
	public partial class RepairOrphanedUserAccountProfileLinks : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.Sql(
					"""
                DELETE FROM user_account_profiles uap
                USING user_accounts ua
                WHERE ua.id = uap.user_account_id
                  AND ua.is_deleted = true;
                """);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			// Intentional no-op: hard-deleted junction residue cannot be reconstructed
			// reliably, and recreating stale permission assignments would be unsafe.
		}
	}
}
