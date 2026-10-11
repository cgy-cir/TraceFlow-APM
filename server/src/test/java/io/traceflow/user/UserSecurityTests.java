package io.traceflow.user;

import io.traceflow.config.SecurityConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@WebMvcTest(value = UserApi.class, excludeAutoConfiguration = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
@ContextConfiguration(classes = {UserApi.class, SecurityConfig.class})
@Import(SecurityConfig.class)
class UserSecurityTests {
    @Autowired MockMvc mvc;
    @Autowired PasswordEncoder encoder;
    @MockitoBean UserService users;

    @BeforeEach void setup() { when(users.sessionValid(any())).thenReturn(true); }

    @Test void anonymousCannotReadUsers() throws Exception {
        mvc.perform(get("/api/v1/users")).andExpect(status().isUnauthorized());
    }
    @Test void memberCannotReadUsers() throws Exception {
        mvc.perform(get("/api/v1/users").with(user("member").roles("MEMBER"))).andExpect(status().isForbidden());
    }
    @Test void writesRequireCsrf() throws Exception {
        mvc.perform(post("/api/v1/users").with(user("admin").roles("ADMIN"))
                .contentType("application/json").content("{}" )).andExpect(status().isForbidden());
    }
    @Test void csrfEndpointWorksBeforeLogin() throws Exception {
        mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }
    @Test void wrongCredentialsReturnJson() throws Exception {
        when(users.loadUserByUsername("missing@example.com")).thenThrow(new org.springframework.security.core.userdetails.UsernameNotFoundException("missing"));
        mvc.perform(post("/api/v1/auth/login").with(csrf()).param("email", "missing@example.com")
                .param("password", "wrong" )).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("LOGIN_FAILED"));
    }
    @Test void validCredentialsCreateAuthenticatedSession() throws Exception {
        var principal = new AccountPrincipal(1, "admin@example.com", encoder.encode("password123"), "admin", "active", 0);
        when(users.loadUserByUsername("admin@example.com")).thenReturn(principal);
        when(users.get(1)).thenReturn(new UserService.UserResponse(1, "admin@example.com", "Admin", "admin", "active", 1, 1, null));
        var result = mvc.perform(post("/api/v1/auth/login").with(csrf()).param("email", "admin@example.com")
                .param("password", "password123")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("admin"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andReturn();
        mvc.perform(get("/api/v1/auth/me").session((org.springframework.mock.web.MockHttpSession) result.getRequest().getSession()))
                .andExpect(jsonPath("$.id").value(1));
        verify(users).recordLogin(1);
    }
    @Test void disabledOrChangedAccountSessionIsRejected() throws Exception {
        var principal = new AccountPrincipal(1, "admin@example.com", "hash", "admin", "active", 0);
        when(users.sessionValid(principal)).thenReturn(false);
        mvc.perform(get("/api/v1/auth/me").with(user(principal)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
    }
    @Test void passwordLimitsUseUtf8Bytes() {
        assertThatCode(() -> UserService.validatePassword("password123")).doesNotThrowAnyException();
        assertThatThrownBy(() -> UserService.validatePassword("short")).isInstanceOf(io.traceflow.event.EventApiException.class);
        assertThatThrownBy(() -> UserService.validatePassword("密".repeat(25))).isInstanceOf(io.traceflow.event.EventApiException.class);
    }

    @Test void ingestionIgnoresExpiredConsoleSession() throws Exception {
        var principal = new AccountPrincipal(1, "admin@example.com", "hash", "admin", "active", 0);
        when(users.sessionValid(principal)).thenReturn(false);
        // This MVC slice contains no ingestion controller; reaching 404 proves the request passed security.
        mvc.perform(post("/api/v1/events/batch").servletPath("/api/v1/events/batch")
                .with(user(principal)).contentType("application/json").content("{}"))
                .andExpect(status().isNotFound());
        verify(users, never()).sessionValid(principal);
    }
}
