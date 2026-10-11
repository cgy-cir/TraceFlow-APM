package io.traceflow.user;

import io.traceflow.event.EventApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class UserService implements UserDetailsService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public UserService(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @Override public AccountPrincipal loadUserByUsername(String email) {
        var accounts = jdbc.query("SELECT * FROM users WHERE email = ?", (rs, row) -> new AccountPrincipal(
                rs.getLong("id"), rs.getString("email"), rs.getString("password_hash"),
                rs.getString("role"), rs.getString("status"), rs.getLong("session_version")), normalizeEmail(email));
        if (accounts.isEmpty()) throw new UsernameNotFoundException("account does not exist");
        return accounts.get(0);
    }

    public boolean sessionValid(AccountPrincipal principal) {
        var accounts = jdbc.query("SELECT status, session_version FROM users WHERE id = ?",
                (rs, row) -> "active".equals(rs.getString("status"))
                        && rs.getLong("session_version") == principal.sessionVersion(), principal.id());
        return !accounts.isEmpty() && accounts.get(0);
    }

    public UserResponse get(long id) {
        var users = jdbc.query("SELECT * FROM users WHERE id = ?", UserService::mapUser, id);
        if (users.isEmpty()) throw new EventApiException(404, "USER_NOT_FOUND", "用户不存在");
        return users.get(0);
    }

    public void recordLogin(long id) {
        jdbc.update("UPDATE users SET last_login_at = ? WHERE id = ?", System.currentTimeMillis(), id);
    }

    public UserListResponse list(String query, String status, String role, int page, int pageSize) {
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (query != null && !query.isBlank()) {
            where.append(" AND (email LIKE ? OR display_name LIKE ?)");
            args.add("%" + query.trim() + "%"); args.add("%" + query.trim() + "%");
        }
        if (status != null && !status.isBlank()) { requireStatus(status); where.append(" AND status = ?"); args.add(status); }
        if (role != null && !role.isBlank()) { requireRole(role); where.append(" AND role = ?"); args.add(role); }
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM users" + where, Long.class, args.toArray());
        args.add(pageSize); args.add((page - 1) * pageSize);
        var items = jdbc.query("SELECT * FROM users" + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                UserService::mapUser, args.toArray());
        return new UserListResponse(items, total, page, pageSize);
    }

    @Transactional
    public UserResponse create(String email, String name, String password, String role) {
        requireRole(role); validateName(name); validatePassword(password);
        var keys = new GeneratedKeyHolder();
        long now = System.currentTimeMillis();
        try {
            jdbc.update(connection -> {
                var statement = connection.prepareStatement("""
                        INSERT INTO users (email, display_name, password_hash, role, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, 'active', ?, ?)
                        """, Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, normalizeEmail(email)); statement.setString(2, name.trim());
                statement.setString(3, encoder.encode(password)); statement.setString(4, role);
                statement.setLong(5, now); statement.setLong(6, now);
                return statement;
            }, keys);
        } catch (DuplicateKeyException exception) {
            throw new EventApiException(409, "EMAIL_EXISTS", "该邮箱已被使用");
        }
        return get(keys.getKey().longValue());
    }

    @Transactional
    public UserResponse update(long actorId, long id, String name, String role, String status) {
        validateName(name); requireRole(role); requireStatus(status);
        // Lock administrators in a stable order before changing access, including concurrent edits.
        var administrators = jdbc.queryForList("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE", Long.class);
        var actor = get(actorId);
        if (!"admin".equals(actor.role()) || !"active".equals(actor.status())) {
            throw new EventApiException(403, "FORBIDDEN", "需要管理员权限");
        }
        var user = get(id);
        boolean accessChanged = !role.equals(user.role()) || !status.equals(user.status());
        if (actorId == id && accessChanged) throw new EventApiException(409, "SELF_ACCESS_CHANGE", "不能修改自己的角色或账号状态");
        if (administrators.contains(id) && administrators.size() == 1 && (!"admin".equals(role) || !"active".equals(status))) {
            throw new EventApiException(409, "LAST_ADMIN", "至少保留一个启用的管理员");
        }
        jdbc.update("UPDATE users SET display_name = ?, role = ?, status = ?, session_version = session_version + ?, updated_at = ? WHERE id = ?",
                name.trim(), role, status, accessChanged ? 1 : 0, System.currentTimeMillis(), id);
        return get(id);
    }

    @Transactional
    public void resetPassword(long actorId, long id, String password) {
        if (actorId == id) throw new EventApiException(409, "SELF_PASSWORD_RESET", "请通过账号菜单修改自己的密码");
        get(id); setPassword(id, password);
    }

    @Transactional
    public void changePassword(long id, String currentPassword, String password) {
        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ? FOR UPDATE", String.class, id);
        if (!encoder.matches(currentPassword, hash)) throw new EventApiException(400, "WRONG_PASSWORD", "当前密码不正确");
        setPassword(id, password);
    }

    private void setPassword(long id, String password) {
        validatePassword(password);
        jdbc.update("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
                encoder.encode(password), System.currentTimeMillis(), id);
    }

    public static void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new EventApiException(400, "INVALID_PASSWORD", "密码至少 8 个字符，最多 72 个 UTF-8 字节");
        }
    }
    private static void validateName(String name) {
        if (name == null || name.isBlank() || name.trim().length() > 100) throw new EventApiException(400, "INVALID_NAME", "姓名不能为空，且不能超过 100 个字符");
    }
    private static void requireRole(String role) {
        if (!List.of("admin", "member").contains(role)) throw new EventApiException(400, "INVALID_ROLE", "角色不正确");
    }
    private static void requireStatus(String status) {
        if (!List.of("active", "disabled").contains(status)) throw new EventApiException(400, "INVALID_STATUS", "状态不正确");
    }
    private static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private static UserResponse mapUser(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        long lastLogin = rs.getLong("last_login_at");
        Long lastLoginAt = rs.wasNull() ? null : lastLogin;
        return new UserResponse(rs.getLong("id"), rs.getString("email"), rs.getString("display_name"),
                rs.getString("role"), rs.getString("status"), rs.getLong("created_at"), rs.getLong("updated_at"), lastLoginAt);
    }
    public record UserResponse(long id, String email, String displayName, String role, String status,
                               long createdAt, long updatedAt, Long lastLoginAt) { }
    public record UserListResponse(List<UserResponse> items, long total, int page, int pageSize) { }
}
