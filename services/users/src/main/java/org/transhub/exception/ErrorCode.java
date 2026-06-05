package org.transhub.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    INVALID_KEY(1001, "Uncategorized error", HttpStatus.BAD_REQUEST),
    USERNAME_INVALID(1003, "Username must be at least {min} characters", HttpStatus.BAD_REQUEST),
    INVALID_PASSWORD(1004, "Password must be at least {min} characters", HttpStatus.BAD_REQUEST),
    USER_NOT_EXISTED(1005, "User not existed", HttpStatus.NOT_FOUND),
    UNAUTHENTICATED(1006, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1007, "You do not have permission", HttpStatus.FORBIDDEN),
    INVALID_DOB(1008, "Your age must be at least {min}", HttpStatus.BAD_REQUEST),
    EMAIL_EXISTED(1009, "Email existed, please choose another one", HttpStatus.BAD_REQUEST),
    USER_EXISTED(1010, "Username existed, please choose another one", HttpStatus.BAD_REQUEST),
    USERNAME_IS_MISSING(1011, "Please enter username", HttpStatus.BAD_REQUEST),

    // Role errors
    ROLE_NOT_FOUND(3101, "Role not found", HttpStatus.NOT_FOUND),
    SOME_ROLES_NOT_FOUND(3102, "Some roles not found", HttpStatus.NOT_FOUND),
    ROLE_NAME_EXISTED(3103, "Role name already exists", HttpStatus.BAD_REQUEST),
    ROLE_HAS_USERS(3104, "Cannot delete role with existing users", HttpStatus.BAD_REQUEST),
    ;

    ErrorCode(int errorCode, String message, HttpStatus httpStatus) {
        this.errorCode = errorCode;
        this.message = message;
        this.httpStatus = httpStatus;
    }

    private final HttpStatus httpStatus;
    private final int errorCode;
    private final String message;

    public int getErrorCode() {
        return errorCode;
    }

    public String getMessage() {
        return message;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
