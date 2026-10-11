package io.traceflow.user;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

public record AccountPrincipal(long id, String email, String passwordHash, String role,
                               String status, long sessionVersion) implements UserDetails {
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(java.util.Locale.ROOT)));
    }
    @Override public String getPassword() { return passwordHash; }
    @Override public String getUsername() { return email; }
    @Override public boolean isEnabled() { return "active".equals(status); }
}
