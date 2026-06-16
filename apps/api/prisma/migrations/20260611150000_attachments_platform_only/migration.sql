UPDATE app.org_feature_access
SET enabled = false
WHERE feature IN ('ATTACHMENTS', 'ATTACHMENTS_REVIEW');
