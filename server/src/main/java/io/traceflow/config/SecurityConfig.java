package io.traceflow.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import io.traceflow.user.AccountPrincipal;
import io.traceflow.user.AccountSessionFilter;
import io.traceflow.user.UserService;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import tools.jackson.databind.ObjectMapper;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, UserService users, ObjectMapper mapper,
                                          @Qualifier("corsConfigurationSource") CorsConfigurationSource corsSource) throws Exception {
        return http
                .csrf(csrf -> csrf.ignoringRequestMatchers("/api/v1/events/batch"))
                .cors(cors -> cors.configurationSource(corsSource))
                .addFilterAfter(new AccountSessionFilter(users), SecurityContextHolderFilter.class)
                .requestCache(cache -> cache.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/me", "/api/v1/auth/login",
                                "/api/v1/events/batch", "/api/v1/health", "/api/v1/missing", "/actuator/health", "/error").permitAll()
                        .requestMatchers("/api/v1/users", "/api/v1/users/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/applications").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/releases", "/api/v1/releases/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/releases/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/releases/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"UNAUTHENTICATED\",\"message\":\"请先登录\"}");
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(403); response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"FORBIDDEN\",\"message\":\"没有权限，或请求校验失败\"}");
                        }))
                .formLogin(login -> login.loginProcessingUrl("/api/v1/auth/login").usernameParameter("email")
                        .successHandler((request, response, authentication) -> {
                            var principal = (AccountPrincipal) authentication.getPrincipal();
                            users.recordLogin(principal.id());
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write(mapper.writeValueAsString(users.get(principal.id())));
                        })
                        .failureHandler((request, response, exception) -> {
                            response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"LOGIN_FAILED\",\"message\":\"邮箱或密码不正确，或账号已被禁用\"}");
                        }))
                .logout(logout -> logout.logoutUrl("/api/v1/auth/logout").deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${TRACEFLOW_CONSOLE_ORIGINS:http://localhost:5173,http://localhost:5174}") String consoleOrigins) {
        CorsConfiguration ingestion = new CorsConfiguration();
        // The ingestion service performs the authoritative appKey + Origin check against allowed_origins.
        // CORS must let the preflight reach that application-level validation for independently hosted sites.
        ingestion.setAllowedOriginPatterns(List.of("*"));
        ingestion.setAllowedMethods(List.of("POST", "OPTIONS"));
        ingestion.setAllowedHeaders(List.of("Content-Type"));

        CorsConfiguration management = new CorsConfiguration();
        management.setAllowedOrigins(java.util.Arrays.stream(consoleOrigins.split(",")).map(String::trim).filter(origin -> !origin.isBlank()).toList());
        management.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        management.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
        management.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/events/batch", ingestion);
        source.registerCorsConfiguration("/api/**", management);
        return source;
    }
}
