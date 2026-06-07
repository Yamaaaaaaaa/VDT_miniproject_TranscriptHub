package org.transhub.exception;

import java.util.Map;
import java.util.Objects;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import jakarta.validation.metadata.ConstraintDescriptor;
import lombok.extern.slf4j.Slf4j;
import org.transhub.dto.response.ApiResponse;

@ControllerAdvice
@Slf4j
public class GlobalException {

    private static final String MIN_ATTRIBUTE = "min";

    @ExceptionHandler(value = RuntimeException.class)
    ResponseEntity<ApiResponse<String>> handleRuntimeException(RuntimeException exception) {
        log.error("Unhandled exception: {}", exception.getMessage(), exception);
        ApiResponse<String> response = new ApiResponse<>();
        response.setCode(ErrorCode.UNCATEGORIZED_EXCEPTION.getErrorCode());
        response.setMessage(ErrorCode.UNCATEGORIZED_EXCEPTION.getMessage());
        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(value = AppException.class)
    ResponseEntity<ApiResponse<Object>> handlingAppException(AppException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        ApiResponse<Object> apiResponse = new ApiResponse<>();
        apiResponse.setCode(errorCode.getErrorCode());
        apiResponse.setMessage(errorCode.getMessage());
        return ResponseEntity.status(errorCode.getHttpStatus()).body(apiResponse);
    }

    @ExceptionHandler(value = AccessDeniedException.class)
    ResponseEntity<ApiResponse<Object>> handlingAccessDeniedException(AccessDeniedException exception) {
        ErrorCode errorCode = ErrorCode.UNAUTHORIZED;
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(ApiResponse.builder()
                        .code(errorCode.getErrorCode())
                        .message(errorCode.getMessage())
                        .build());
    }

    @ExceptionHandler(value = MethodArgumentNotValidException.class)
    ResponseEntity<ApiResponse<String>> handleValidation(MethodArgumentNotValidException exception) {
        FieldError fieldError = exception.getFieldError();
        String enumKey = fieldError != null ? fieldError.getDefaultMessage() : "";
        ErrorCode errorCode = ErrorCode.INVALID_KEY;

        Map<String, Object> attributes = null;
        try {
            errorCode = ErrorCode.valueOf(enumKey);
            ConstraintDescriptor<?> descriptor = fieldError.unwrap(ConstraintDescriptor.class);
            attributes = descriptor.getAttributes();
            log.info("Validation attributes: {}", attributes);
        } catch (IllegalArgumentException e) {
            ApiResponse<String> response = new ApiResponse<>();
            response.setCode(ErrorCode.INVALID_KEY.getErrorCode());
            response.setMessage(enumKey);
            return ResponseEntity.badRequest().body(response);
        }

        ApiResponse<String> response = new ApiResponse<>();
        response.setCode(errorCode.getErrorCode());
        response.setMessage(
                Objects.nonNull(attributes)
                        ? mapAttribute(errorCode.getMessage(), attributes)
                        : errorCode.getMessage());
        return ResponseEntity.status(errorCode.getHttpStatus()).body(response);
    }

    private String mapAttribute(String message, Map<String, Object> attributes) {
        String minValue = String.valueOf(attributes.get(MIN_ATTRIBUTE));
        return message.replace("{" + MIN_ATTRIBUTE + "}", minValue);
    }
}
