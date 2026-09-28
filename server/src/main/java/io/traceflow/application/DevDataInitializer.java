package io.traceflow.application;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
public class DevDataInitializer implements ApplicationRunner {
    static final long DEV_USER_ID = 1L;

    private final JdbcTemplate jdbcTemplate;

    public DevDataInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, display_name, status, created_at, updated_at)
                VALUES (?, 'local@traceflow.dev', '{noop}disabled', 'Local Developer', 'active', ?, ?)
                ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), updated_at = VALUES(updated_at)
                """, DEV_USER_ID, System.currentTimeMillis(), System.currentTimeMillis());
        jdbcTemplate.update("""
                INSERT INTO applications
                    (name, app_key, platform, allowed_origins, retention_days, status, created_by, created_at, updated_at)
                VALUES
                    ('Demo Web', ?, 'web', JSON_ARRAY('http://localhost:5174'), 30, 'active', ?, ?, ?)
                ON DUPLICATE KEY UPDATE name = VALUES(name), allowed_origins = VALUES(allowed_origins), updated_at = VALUES(updated_at)
                """, ApplicationService.DEMO_APP_KEY, DEV_USER_ID, System.currentTimeMillis(), System.currentTimeMillis());
    }
}
