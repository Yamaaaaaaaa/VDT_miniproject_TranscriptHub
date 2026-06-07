package org.transhub.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    INVALID_KEY(1001, "Uncategorized error", HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(1006, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1007, "You do not have permission", HttpStatus.FORBIDDEN),

    // Meeting Service error codes
    MEETING_NOT_FOUND(5001, "Meeting not found", HttpStatus.NOT_FOUND),
    AUDIO_FILE_NOT_FOUND(5002, "Audio file not found", HttpStatus.NOT_FOUND),
    MEMBER_NOT_FOUND(5003, "Member not found in meeting", HttpStatus.NOT_FOUND),
    MEMBER_ALREADY_EXISTS(5004, "User is already a member of this meeting", HttpStatus.BAD_REQUEST),
    INVALID_ACTION(5005, "Invalid action or permission", HttpStatus.BAD_REQUEST),
    USER_NOT_FOUND(5006, "User not found", HttpStatus.NOT_FOUND),
    AUDIO_FILE_ALREADY_LINKED(5007, "Audio file is already linked to another meeting", HttpStatus.BAD_REQUEST),
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
