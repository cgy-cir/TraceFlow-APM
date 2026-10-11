package io.traceflow.application;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;

@Component
@Profile("dev")
public class DevDataInitializer implements ApplicationRunner {
    static final long DEV_USER_ID = 1L;

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder encoder;
    private final String adminPassword;

    public DevDataInitializer(JdbcTemplate jdbcTemplate, PasswordEncoder encoder,
                              @Value("${TRACEFLOW_DEV_ADMIN_PASSWORD:TraceFlow@2026}") String adminPassword) {
        this.jdbcTemplate = jdbcTemplate;
        this.encoder = encoder;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        io.traceflow.user.UserService.validatePassword(adminPassword);
        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, display_name, status, role, created_at, updated_at)
                VALUES (?, 'local@traceflow.dev', ?, 'Local Developer', 'active', 'admin', ?, ?)
                ON DUPLICATE KEY UPDATE password_hash = IF(password_hash = '{noop}disabled', VALUES(password_hash), password_hash)
                """, DEV_USER_ID, encoder.encode(adminPassword), System.currentTimeMillis(), System.currentTimeMillis());
        jdbcTemplate.update("""
                INSERT INTO applications
                    (name, app_key, platform, allowed_origins, retention_days, status, created_by, created_at, updated_at)
                VALUES
                    ('Demo Web', ?, 'web', JSON_ARRAY('http://localhost:5174'), 30, 'active', ?, ?, ?)
                ON DUPLICATE KEY UPDATE name = VALUES(name), allowed_origins = VALUES(allowed_origins), updated_at = VALUES(updated_at)
                """, ApplicationService.DEMO_APP_KEY, DEV_USER_ID, System.currentTimeMillis(), System.currentTimeMillis());
    }
}
