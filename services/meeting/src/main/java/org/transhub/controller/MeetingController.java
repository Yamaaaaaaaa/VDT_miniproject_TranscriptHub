package org.transhub.controller;

import io.swagger.v3.oas.annotations.Parameter;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.transhub.dto.request.MeetingCreateRequest;
import org.transhub.dto.request.MeetingUpdateRequest;
import org.transhub.dto.request.MemberAddRequest;
import org.transhub.dto.request.MemberUpdateRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.MeetingMemberResponse;
import org.transhub.dto.response.MeetingResponse;
import org.transhub.service.MeetingService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/meetings")
@RequiredArgsConstructor
@Slf4j
public class MeetingController {

    private final MeetingService meetingService;

    @PostMapping
    public ResponseEntity<ApiResponse<MeetingResponse>> createMeeting(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long creatorId,
            @Valid @RequestBody MeetingCreateRequest request) {
        log.info("Request to create meeting. Creator ID: {}", creatorId);
        MeetingResponse response = meetingService.createMeeting(request, creatorId);
        return ResponseEntity.status(HttpStatus.CREATED).body(
                ApiResponse.<MeetingResponse>builder()
                        .result(response)
                        .build()
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<MeetingResponse>> getMeeting(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id,
            @RequestParam(value = "includeAudioFile", defaultValue = "false") boolean includeAudioFile,
            @RequestParam(value = "includeTranscript", defaultValue = "false") boolean includeTranscript) {
        log.info("Request to get meeting: {}. Requester: {}, includeAudioFile: {}, includeTranscript: {}", id, requesterId, includeAudioFile, includeTranscript);
        MeetingResponse response = meetingService.getMeeting(id, requesterId, includeAudioFile, includeTranscript);
        return ResponseEntity.ok(
                ApiResponse.<MeetingResponse>builder()
                        .result(response)
                        .build()
        );
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<MeetingResponse>>> listMeetings(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long userId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size,
            @RequestParam(value = "includeAudioFile", defaultValue = "false") boolean includeAudioFile,
            @RequestParam(value = "includeTranscript", defaultValue = "false") boolean includeTranscript) {
        log.info("Request to list meetings. User: {}, Page: {}, Size: {}, includeAudioFile: {}, includeTranscript: {}", userId, page, size, includeAudioFile, includeTranscript);
        Page<MeetingResponse> response = meetingService.listMeetings(userId, PageRequest.of(page, size), includeAudioFile, includeTranscript);
        return ResponseEntity.ok(
                ApiResponse.<Page<MeetingResponse>>builder()
                        .result(response)
                        .build()
        );
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<MeetingResponse>> updateMeeting(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id,
            @Valid @RequestBody MeetingUpdateRequest request) {
        log.info("Request to update meeting: {}. Requester: {}", id, requesterId);
        MeetingResponse response = meetingService.updateMeeting(id, request, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<MeetingResponse>builder()
                        .result(response)
                        .build()
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<String>> deleteMeeting(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id) {
        log.info("Request to delete meeting: {}. Requester: {}", id, requesterId);
        meetingService.deleteMeeting(id, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<String>builder()
                        .result("Meeting deleted successfully")
                        .build()
        );
    }

    @GetMapping("/{id}/members")
    public ResponseEntity<ApiResponse<List<MeetingMemberResponse>>> getMembers(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id) {
        log.info("Request to get members of meeting: {}. Requester: {}", id, requesterId);
        List<MeetingMemberResponse> response = meetingService.getMembers(id, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<List<MeetingMemberResponse>>builder()
                        .result(response)
                        .build()
        );
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<ApiResponse<MeetingMemberResponse>> addMember(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id,
            @Valid @RequestBody MemberAddRequest request) {
        log.info("Request to add member {} to meeting: {}. Requester: {}", request.getUserId(), id, requesterId);
        MeetingMemberResponse response = meetingService.addMember(id, request, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<MeetingMemberResponse>builder()
                        .result(response)
                        .build()
        );
    }

    @PutMapping("/{id}/members/{userId}")
    public ResponseEntity<ApiResponse<MeetingMemberResponse>> updateMemberRole(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id,
            @PathVariable("userId") Long targetUserId,
            @Valid @RequestBody MemberUpdateRequest request) {
        log.info("Request to update role of user {} in meeting: {}. Requester: {}", targetUserId, id, requesterId);
        MeetingMemberResponse response = meetingService.updateMemberRole(id, targetUserId, request, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<MeetingMemberResponse>builder()
                        .result(response)
                        .build()
        );
    }

    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<ApiResponse<String>> removeMember(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long requesterId,
            @PathVariable("id") UUID id,
            @PathVariable("userId") Long targetUserId) {
        log.info("Request to remove user {} from meeting: {}. Requester: {}", targetUserId, id, requesterId);
        meetingService.removeMember(id, targetUserId, requesterId);
        return ResponseEntity.ok(
                ApiResponse.<String>builder()
                        .result("Member removed from meeting successfully")
                        .build()
        );
    }
}
