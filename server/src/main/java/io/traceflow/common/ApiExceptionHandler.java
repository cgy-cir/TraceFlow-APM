package io.traceflow.common;

import io.traceflow.event.EventApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
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

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class,
            ConstraintViolationException.class, HandlerMethodValidationException.class})
    ResponseEntity<ApiError> handleBadRequest(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(error("INVALID_REQUEST", "request body is invalid", request));
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> handleUploadSize(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(413).body(error("UPLOAD_TOO_LARGE", "单文件最多 5 MiB，总请求最多 11 MiB", request));
    }

    @ExceptionHandler(org.springframework.web.multipart.support.MissingServletRequestPartException.class)
    ResponseEntity<ApiError> handleMissingPart(Exception exception, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(error("INVALID_REQUEST", "需要同时选择 JS 和 Source Map 文件", request));
    }

    private ApiError error(String code, String message, HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-Id");
        return new ApiError(code, message, requestId == null ? UUID.randomUUID().toString() : requestId);
    }

    public record ApiError(String code, String message, String requestId) {
    }
}
