package org.transhub.exception;


import org.springframework.http.HttpStatus;

public enum ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    INVALID_KEY(1001, "Uncategorized error", HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(1006, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1007, "You do not have permission", HttpStatus.FORBIDDEN),

    // File Service error codes
    FILE_NOT_FOUND(4001, "File not found", HttpStatus.NOT_FOUND),
    FILE_EMPTY(4002, "Uploaded file is empty", HttpStatus.BAD_REQUEST),
    FILE_UPLOAD_FAILED(4003, "File upload failed", HttpStatus.INTERNAL_SERVER_ERROR),
    FILE_MERGE_FAILED(4004, "Chunk merge failed", HttpStatus.INTERNAL_SERVER_ERROR),
    FILE_STREAM_FAILED(4005, "File streaming failed", HttpStatus.INTERNAL_SERVER_ERROR),
    INVALID_CHUNK(4006, "Invalid chunk size or parameters", HttpStatus.BAD_REQUEST),
    UPLOAD_NOT_INITIALIZED(4007, "Upload session not initialized or expired", HttpStatus.BAD_REQUEST),
    INVALID_RANGE(4008, "Requested range is not satisfiable", HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE),
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
