using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddImpersonationEndTrigger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every removal of an impersonation session (end, sweep, presentation-time
            // expiry, revoke-all, user-delete cascade) leaves a tombstone (#1519).
            // Additive: old code keeps working, it just also gets tombstones.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION record_impersonation_session_end() RETURNS trigger AS $$
                BEGIN
                    INSERT INTO impersonation_session_ends (session_id, ended_at, reason, created_at)
                    VALUES (
                        OLD.id,
                        CASE WHEN OLD.expires_at <= now() THEN OLD.expires_at ELSE now() END,
                        CASE WHEN OLD.expires_at <= now() THEN 'Expired' ELSE 'Revoked' END,
                        now()
                    )
                    ON CONFLICT (session_id) DO NOTHING;
                    RETURN OLD;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER sessions_record_impersonation_end
                AFTER DELETE ON sessions
                FOR EACH ROW WHEN (OLD.is_impersonation)
                EXECUTE FUNCTION record_impersonation_session_end();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS sessions_record_impersonation_end ON sessions;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS record_impersonation_session_end();");
        }
    }
}
