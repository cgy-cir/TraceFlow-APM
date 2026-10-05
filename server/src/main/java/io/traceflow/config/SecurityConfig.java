package io.traceflow.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/**", "/actuator/health", "/error").permitAll()
                        .anyRequest().authenticated())
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration ingestion = new CorsConfiguration();
        // The ingestion service performs the authoritative appKey + Origin check against allowed_origins.
        // CORS must let the preflight reach that application-level validation for independently hosted sites.
        ingestion.setAllowedOriginPatterns(List.of("*"));
        ingestion.setAllowedMethods(List.of("POST", "OPTIONS"));
        ingestion.setAllowedHeaders(List.of("Content-Type"));

        CorsConfiguration management = new CorsConfiguration();
        management.setAllowedOrigins(List.of("http://localhost:5173", "http://localhost:5174"));
        management.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        management.setAllowedHeaders(List.of("Content-Type"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/events/batch", ingestion);
        source.registerCorsConfiguration("/api/**", management);
        return source;
    }
}
