package io.traceflow.user;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(-10)
public class BootstrapAdminInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final UserService users;
    private final String email;
    private final String password;

    public BootstrapAdminInitializer(JdbcTemplate jdbc, UserService users,
            @Value("${TRACEFLOW_BOOTSTRAP_ADMIN_EMAIL:}") String email,
            @Value("${TRACEFLOW_BOOTSTRAP_ADMIN_PASSWORD:}") String password) {
        this.jdbc = jdbc; this.users = users; this.email = email; this.password = password;
    }

    @Override public void run(ApplicationArguments args) {
        if (!email.isBlank() && !password.isBlank()
                && jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'", Long.class) == 0) {
            users.create(email, "Administrator", password, "admin");
        }
    }
}
