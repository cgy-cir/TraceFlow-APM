package io.traceflow.user;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
public class UserApi {
    private final UserService service;
    public UserApi(UserService service) { this.service = service; }

    @GetMapping("/api/v1/auth/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getHeaderName(), token.getToken()); }

    @GetMapping("/api/v1/auth/me")
    public UserService.UserResponse me(@AuthenticationPrincipal AccountPrincipal principal) {
        return principal == null ? null : service.get(principal.id());
    }

    @PostMapping("/api/v1/auth/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal AccountPrincipal principal, @Valid @RequestBody ChangePasswordRequest request,
                               HttpServletRequest httpRequest) {
        service.changePassword(principal.id(), request.currentPassword(), request.password());
        httpRequest.getSession().invalidate();
        SecurityContextHolder.clearContext();
    }

    @GetMapping("/api/v1/users")
    public UserService.UserListResponse users(@RequestParam(required = false) @Size(max = 100) String query,
            @RequestParam(required = false) String status, @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "1") @Min(1) @Max(10000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return service.list(query, status, role, page, pageSize);
    }

    @PostMapping("/api/v1/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserService.UserResponse create(@Valid @RequestBody CreateUserRequest request) {
        return service.create(request.email(), request.displayName(), request.password(), request.role());
    }

    @PatchMapping("/api/v1/users/{id}")
    public UserService.UserResponse update(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable long id, @Valid @RequestBody UpdateUserRequest request) {
        return service.update(principal.id(), id, request.displayName(), request.role(), request.status());
    }

    @PostMapping("/api/v1/users/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable long id, @Valid @RequestBody PasswordRequest request) {
        service.resetPassword(principal.id(), id, request.password());
    }

    public record CsrfResponse(String headerName, String token) { }
    public record CreateUserRequest(@NotBlank @Email @Size(max = 191) String email,
            @NotBlank @Size(max = 100) String displayName, @NotBlank @Size(min = 8, max = 72) String password,
            @NotNull @Pattern(regexp = "admin|member") String role) { }
    public record UpdateUserRequest(@NotBlank @Size(max = 100) String displayName,
            @NotNull @Pattern(regexp = "admin|member") String role, @NotNull @Pattern(regexp = "active|disabled") String status) { }
    public record PasswordRequest(@NotBlank @Size(min = 8, max = 72) String password) { }
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min = 8, max = 72) String password) { }
}
