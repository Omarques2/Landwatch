-- Remove admin/powerbi/rls schema not used in LandWatch MVP

DROP VIEW IF EXISTS app.sec_rls_base CASCADE;

DROP TABLE IF EXISTS app.rls_rule CASCADE;
DROP TABLE IF EXISTS app.rls_target CASCADE;
DROP TABLE IF EXISTS app.bi_user_page_allowlist CASCADE;
DROP TABLE IF EXISTS app.bi_customer_page_allowlist CASCADE;
DROP TABLE IF EXISTS app.bi_user_page_groups CASCADE;
DROP TABLE IF EXISTS app.bi_customer_page_groups CASCADE;
DROP TABLE IF EXISTS app.bi_page_group_pages CASCADE;
DROP TABLE IF EXISTS app.bi_page_groups CASCADE;
DROP TABLE IF EXISTS app.bi_report_pages CASCADE;
DROP TABLE IF EXISTS app.bi_customer_report_permissions CASCADE;
DROP TABLE IF EXISTS app.bi_customer_workspaces CASCADE;
DROP TABLE IF EXISTS app.bi_reports CASCADE;
DROP TABLE IF EXISTS app.bi_workspaces CASCADE;
DROP TABLE IF EXISTS app.audit_log CASCADE;
DROP TABLE IF EXISTS app.user_customer_memberships CASCADE;
DROP TABLE IF EXISTS app.customers CASCADE;
DROP TABLE IF EXISTS app.user_app_roles CASCADE;
DROP TABLE IF EXISTS app.app_roles CASCADE;
DROP TABLE IF EXISTS app.applications CASCADE;

DROP TYPE IF EXISTS app.rls_rule_op CASCADE;
DROP TYPE IF EXISTS app.rls_target_status CASCADE;
DROP TYPE IF EXISTS app.rls_default_behavior CASCADE;
DROP TYPE IF EXISTS app.rls_value_type CASCADE;
DROP TYPE IF EXISTS app.membership_role CASCADE;
