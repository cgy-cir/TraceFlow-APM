ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'member',
    ADD COLUMN session_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN last_login_at BIGINT UNSIGNED NULL,
    ADD CONSTRAINT chk_users_role CHECK (role IN ('admin', 'member'));

-- Preserve the owner of the existing development application as administrator.
UPDATE users SET role = 'admin' WHERE id = 1;
CREATE INDEX idx_users_role_status ON users (role, status);
