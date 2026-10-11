package io.traceflow.user;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class AccountSessionFilter extends OncePerRequestFilter {
    private final UserService users;
    public AccountSessionFilter(UserService users) { this.users = users; }

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        // Beacon may carry Console cookies; SDK ingestion must remain independent of Console sessions.
        return "/api/v1/events/batch".equals(request.getServletPath());
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                              FilterChain chain) throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AccountPrincipal principal
                && !users.sessionValid(principal)) {
            SecurityContextHolder.clearContext();
            var session = request.getSession(false);
            if (session != null) session.invalidate();
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":\"SESSION_EXPIRED\",\"message\":\"登录已失效，请重新登录\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
