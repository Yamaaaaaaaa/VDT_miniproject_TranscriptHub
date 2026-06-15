import { HttpStatus } from '@nestjs/common';

export interface ErrorCodeInfo {
  errorCode: number;
  message: string;
  httpStatus: HttpStatus;
}

export const ErrorCodes = {
  UNCATEGORIZED_EXCEPTION: { errorCode: 9999, message: 'Uncategorized error', httpStatus: HttpStatus.INTERNAL_SERVER_ERROR },
  INVALID_KEY: { errorCode: 1001, message: 'Validation failed', httpStatus: HttpStatus.BAD_REQUEST },
  USER_NOT_EXISTED: { errorCode: 1005, message: 'User not existed', httpStatus: HttpStatus.NOT_FOUND },
  UNAUTHENTICATED: { errorCode: 1006, message: 'Unauthenticated', httpStatus: HttpStatus.UNAUTHORIZED },
  UNAUTHORIZED: { errorCode: 1007, message: 'You do not have permission', httpStatus: HttpStatus.FORBIDDEN },
  EMAIL_EXISTED: { errorCode: 1009, message: 'Email existed, please choose another one', httpStatus: HttpStatus.BAD_REQUEST },
  USER_EXISTED: { errorCode: 1010, message: 'Username existed, please choose another one', httpStatus: HttpStatus.BAD_REQUEST },
  USER_NOT_FOUND: { errorCode: 1005, message: 'User not found', httpStatus: HttpStatus.NOT_FOUND },
  ROLE_NOT_FOUND: { errorCode: 1011, message: 'Role not found', httpStatus: HttpStatus.NOT_FOUND },
  ROLE_NAME_EXISTED: { errorCode: 1012, message: 'Role name already exists', httpStatus: HttpStatus.BAD_REQUEST },
  
  // File Service
  FILE_NOT_FOUND: { errorCode: 4001, message: 'File not found', httpStatus: HttpStatus.NOT_FOUND },
  FILE_EMPTY: { errorCode: 4002, message: 'Uploaded file is empty', httpStatus: HttpStatus.BAD_REQUEST },
  INVALID_RANGE: { errorCode: 4008, message: 'Requested range is not satisfiable', httpStatus: HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE },
  AUDIO_FILE_NOT_FOUND: { errorCode: 4003, message: 'Audio file not found', httpStatus: HttpStatus.NOT_FOUND },
  FILE_UPLOAD_FAILED: { errorCode: 4004, message: 'File upload failed', httpStatus: HttpStatus.INTERNAL_SERVER_ERROR },
  FILE_MERGE_FAILED: { errorCode: 4005, message: 'File merge failed', httpStatus: HttpStatus.INTERNAL_SERVER_ERROR },

  // Meeting Service
  MEETING_NOT_FOUND: { errorCode: 5001, message: 'Meeting not found', httpStatus: HttpStatus.NOT_FOUND },
  MEMBER_NOT_FOUND: { errorCode: 5003, message: 'Member not found in meeting', httpStatus: HttpStatus.NOT_FOUND },
  MEMBER_ALREADY_EXISTS: { errorCode: 5004, message: 'User is already a member of this meeting', httpStatus: HttpStatus.BAD_REQUEST },
  INVALID_ACTION: { errorCode: 5005, message: 'Invalid action or permission', httpStatus: HttpStatus.BAD_REQUEST },
  AUDIO_FILE_ALREADY_LINKED: { errorCode: 5007, message: 'Audio file is already linked to another meeting', httpStatus: HttpStatus.BAD_REQUEST },

  // Transcript Service
  TRANSCRIPT_NOT_FOUND: { errorCode: 6001, message: 'Transcript not found', httpStatus: HttpStatus.NOT_FOUND },
  TRANSCRIPT_ALREADY_EXISTS: { errorCode: 6002, message: 'Transcript already exists for this audio file', httpStatus: HttpStatus.BAD_REQUEST },
};

export class AppException extends Error {
  constructor(
    public readonly errorCodeInfo: ErrorCodeInfo,
    message?: string,
  ) {
    super(message || errorCodeInfo.message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
