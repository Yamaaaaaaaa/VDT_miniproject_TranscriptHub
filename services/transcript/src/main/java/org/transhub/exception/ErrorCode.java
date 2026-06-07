package org.transhub.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    INVALID_KEY(1001, "Uncategorized error", HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(1006, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1007, "You do not have permission", HttpStatus.FORBIDDEN),

    // Transcript Service error codes
    TRANSCRIPT_NOT_FOUND(6001, "Transcript not found", HttpStatus.NOT_FOUND),
    TRANSCRIPT_ALREADY_EXISTS(6002, "Transcript already exists for this audio file", HttpStatus.BAD_REQUEST),
    GENERATE_FAILED(6003, "Failed to generate transcript", HttpStatus.INTERNAL_SERVER_ERROR),
    AUDIO_FILE_NOT_FOUND(6004, "Audio file not found", HttpStatus.NOT_FOUND),
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
