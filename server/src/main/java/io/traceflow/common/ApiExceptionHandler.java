package io.traceflow.common;

import io.traceflow.event.EventApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.UUID;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(EventApiException.class)
    ResponseEntity<ApiError> handleEventApiException(EventApiException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.getStatus())
                .body(error(exception.getCode(), exception.getMessage(), request));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class})
    ResponseEntity<ApiError> handleBadRequest(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(error("INVALID_REQUEST", "request body is invalid", request));
    }

    private ApiError error(String code, String message, HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-Id");
        return new ApiError(code, message, requestId == null ? UUID.randomUUID().toString() : requestId);
    }

    public record ApiError(String code, String message, String requestId) {
    }
}
