package org.transhub.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.transhub.client.FileClient;
import org.transhub.client.UserClient;
import org.transhub.dto.response.UserResponse;
import org.transhub.dto.request.MeetingCreateRequest;
import org.transhub.dto.request.MeetingUpdateRequest;
import org.transhub.dto.request.MemberAddRequest;
import org.transhub.dto.request.MemberUpdateRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.MeetingMemberResponse;
import org.transhub.dto.response.MeetingResponse;
import org.transhub.entity.Meeting;
import org.transhub.entity.MeetingMember;
import org.transhub.entity.MeetingRole;
import org.transhub.entity.MeetingStatus;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.repository.MeetingMemberRepository;
import org.transhub.repository.MeetingRepository;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final MeetingMemberRepository meetingMemberRepository;
    private final FileClient fileClient;
    private final UserClient userClient;

    private MeetingResponse mapToMeetingResponse(Meeting meeting) {
        return MeetingResponse.builder()
                .id(meeting.getId())
                .title(meeting.getTitle())
                .description(meeting.getDescription())
                .creatorId(meeting.getCreatorId())
                .audioFileId(meeting.getAudioFileId())
                .status(meeting.getStatus())
                .createdAt(meeting.getCreatedAt())
                .updatedAt(meeting.getUpdatedAt())
                .build();
    }

    private MeetingMemberResponse mapToMemberResponse(MeetingMember member) {
        return MeetingMemberResponse.builder()
                .id(member.getId())
                .meetingId(member.getMeetingId())
                .userId(member.getUserId())
                .role(member.getRole())
                .joinedAt(member.getJoinedAt())
                .build();
    }

    @Transactional
    public MeetingResponse createMeeting(MeetingCreateRequest request, Long creatorId) {
        log.info("Creating meeting with title: {}, creatorId: {}, audioFileId: {}", request.getTitle(), creatorId, request.getAudioFileId());

        // Validate audio file existence using FileClient
        try {
            ApiResponse<Boolean> fileExistsResponse = fileClient.checkFileExists(request.getAudioFileId());
            if (fileExistsResponse == null || fileExistsResponse.getResult() == null || !fileExistsResponse.getResult()) {
                log.warn("Audio file validation failed: file does not exist. ID: {}", request.getAudioFileId());
                throw new AppException(ErrorCode.AUDIO_FILE_NOT_FOUND);
            }
        } catch (AppException ae) {
            throw ae;
        } catch (Exception e) {
            log.error("Failed to connect to file-service for validation", e);
            throw new AppException(ErrorCode.AUDIO_FILE_NOT_FOUND);
        }

        // Check if audio file is already linked to another meeting
        if (meetingRepository.existsByAudioFileId(request.getAudioFileId())) {
            throw new AppException(ErrorCode.AUDIO_FILE_ALREADY_LINKED);
        }

        // Save meeting
        Meeting meeting = Meeting.builder()
                .title(request.getTitle())
                .description(request.getDescription())
                .creatorId(creatorId)
                .audioFileId(request.getAudioFileId())
                .status(MeetingStatus.CREATING)
                .build();
        Meeting savedMeeting = meetingRepository.save(meeting);

        // Add creator as HOST
        MeetingMember member = MeetingMember.builder()
                .meetingId(savedMeeting.getId())
                .userId(creatorId)
                .role(MeetingRole.HOST)
                .build();
        meetingMemberRepository.save(member);

        return mapToMeetingResponse(savedMeeting);
    }

    public MeetingResponse getMeeting(UUID meetingId, Long requesterId) {
        log.info("Retrieving meeting: {} by requester: {}", meetingId, requesterId);
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new AppException(ErrorCode.MEETING_NOT_FOUND));

        // Check membership
        if (!meetingMemberRepository.existsByMeetingIdAndUserId(meetingId, requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        return mapToMeetingResponse(meeting);
    }

    public Page<MeetingResponse> listMeetings(Long userId, Pageable pageable) {
        log.info("Listing meetings for user: {}", userId);
        Page<Meeting> meetings = meetingRepository.findMeetingsByUserId(userId, pageable);
        return meetings.map(this::mapToMeetingResponse);
    }

    @Transactional
    public MeetingResponse updateMeeting(UUID meetingId, MeetingUpdateRequest request, Long requesterId) {
        log.info("Updating meeting: {} by requester: {}", meetingId, requesterId);
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new AppException(ErrorCode.MEETING_NOT_FOUND));

        // Requester must be HOST or EDITOR to update meeting
        MeetingMember member = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, requesterId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));

        if (member.getRole() != MeetingRole.HOST && member.getRole() != MeetingRole.EDITOR) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        meeting.setTitle(request.getTitle());
        meeting.setDescription(request.getDescription());
        if (request.getStatus() != null) {
            meeting.setStatus(request.getStatus());
        }

        Meeting updatedMeeting = meetingRepository.save(meeting);
        return mapToMeetingResponse(updatedMeeting);
    }

    @Transactional
    public void deleteMeeting(UUID meetingId, Long requesterId) {
        log.info("Deleting meeting: {} by requester: {}", meetingId, requesterId);
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new AppException(ErrorCode.MEETING_NOT_FOUND));

        // Requester must be HOST to delete meeting
        MeetingMember member = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, requesterId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));

        if (member.getRole() != MeetingRole.HOST) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        // Delete all members first
        List<MeetingMember> members = meetingMemberRepository.findByMeetingId(meetingId);
        meetingMemberRepository.deleteAll(members);

        meetingRepository.delete(meeting);
    }

    @Transactional
    public MeetingMemberResponse addMember(UUID meetingId, MemberAddRequest request, Long requesterId) {
        log.info("Adding member (userId: {}, email: {}) to meeting: {} by requester: {}", request.getUserId(), request.getEmail(), meetingId, requesterId);

        // Requester must be HOST to add members
        MeetingMember requester = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, requesterId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));

        if (requester.getRole() != MeetingRole.HOST) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        Long targetUserId = request.getUserId();
        if (targetUserId == null && request.getEmail() != null) {
            // Lookup user ID by email via UserClient
            try {
                ApiResponse<UserResponse> userResponse = userClient.getUserByEmail(request.getEmail());
                if (userResponse == null || userResponse.getResult() == null) {
                    throw new AppException(ErrorCode.USER_NOT_FOUND);
                }
                targetUserId = userResponse.getResult().getId();
            } catch (AppException ae) {
                throw ae;
            } catch (Exception e) {
                log.error("Failed to lookup user by email: {}", request.getEmail(), e);
                throw new AppException(ErrorCode.USER_NOT_FOUND);
            }
        } else if (targetUserId != null) {
            // Validate user ID existence via UserClient
            try {
                ApiResponse<UserResponse> userResponse = userClient.getUserById(targetUserId);
                if (userResponse == null || userResponse.getResult() == null) {
                    throw new AppException(ErrorCode.USER_NOT_FOUND);
                }
            } catch (AppException ae) {
                throw ae;
            } catch (Exception e) {
                log.error("Failed to validate user ID: {}", targetUserId, e);
                throw new AppException(ErrorCode.USER_NOT_FOUND);
            }
        }

        if (targetUserId == null) {
            throw new AppException(ErrorCode.INVALID_ACTION);
        }

        // Check if member already exists
        if (meetingMemberRepository.existsByMeetingIdAndUserId(meetingId, targetUserId)) {
            throw new AppException(ErrorCode.MEMBER_ALREADY_EXISTS);
        }

        MeetingMember newMember = MeetingMember.builder()
                .meetingId(meetingId)
                .userId(targetUserId)
                .role(request.getRole())
                .build();

        MeetingMember savedMember = meetingMemberRepository.save(newMember);
        return mapToMemberResponse(savedMember);
    }

    @Transactional
    public MeetingMemberResponse updateMemberRole(UUID meetingId, Long targetUserId, MemberUpdateRequest request, Long requesterId) {
        log.info("Updating member: {} role to {} in meeting: {} by requester: {}", targetUserId, request.getRole(), meetingId, requesterId);

        // Requester must be HOST to update roles
        MeetingMember requester = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, requesterId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));

        if (requester.getRole() != MeetingRole.HOST) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        MeetingMember targetMember = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, targetUserId)
                .orElseThrow(() -> new AppException(ErrorCode.MEMBER_NOT_FOUND));

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new AppException(ErrorCode.MEETING_NOT_FOUND));

        // Prevent changing the creator's role (the creator must always be HOST)
        if (targetUserId.equals(meeting.getCreatorId()) && request.getRole() != MeetingRole.HOST) {
            throw new AppException(ErrorCode.INVALID_ACTION);
        }

        // Prevent self-role modification if it degrades the host count
        if (targetUserId.equals(requesterId) && request.getRole() != MeetingRole.HOST) {
            long hostCount = meetingMemberRepository.findByMeetingId(meetingId).stream()
                    .filter(m -> m.getRole() == MeetingRole.HOST)
                    .count();
            if (hostCount <= 1) {
                throw new AppException(ErrorCode.INVALID_ACTION);
            }
        }

        targetMember.setRole(request.getRole());
        MeetingMember updatedMember = meetingMemberRepository.save(targetMember);
        return mapToMemberResponse(updatedMember);
    }

    @Transactional
    public void removeMember(UUID meetingId, Long targetUserId, Long requesterId) {
        log.info("Removing member: {} from meeting: {} by requester: {}", targetUserId, meetingId, requesterId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new AppException(ErrorCode.MEETING_NOT_FOUND));

        // Prevent removing the creator of the meeting (creator cannot leave or be removed; they must delete the meeting)
        if (targetUserId.equals(meeting.getCreatorId())) {
            throw new AppException(ErrorCode.INVALID_ACTION);
        }

        // Requester must be HOST or they are removing themselves (leaving)
        boolean isSelf = targetUserId.equals(requesterId);
        MeetingMember requester = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, requesterId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));

        if (!isSelf && requester.getRole() != MeetingRole.HOST) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        MeetingMember targetMember = meetingMemberRepository.findByMeetingIdAndUserId(meetingId, targetUserId)
                .orElseThrow(() -> new AppException(ErrorCode.MEMBER_NOT_FOUND));

        // If a HOST is leaving, verify they are not the sole HOST
        if (isSelf && targetMember.getRole() == MeetingRole.HOST) {
            long hostCount = meetingMemberRepository.findByMeetingId(meetingId).stream()
                    .filter(m -> m.getRole() == MeetingRole.HOST)
                    .count();
            if (hostCount <= 1) {
                throw new AppException(ErrorCode.INVALID_ACTION);
            }
        }

        meetingMemberRepository.delete(targetMember);
    }

    public List<MeetingMemberResponse> getMembers(UUID meetingId, Long requesterId) {
        log.info("Retrieving members of meeting: {} by requester: {}", meetingId, requesterId);

        // Check if requester is a member of the meeting
        if (!meetingMemberRepository.existsByMeetingIdAndUserId(meetingId, requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        return meetingMemberRepository.findByMeetingId(meetingId).stream()
                .map(this::mapToMemberResponse)
                .collect(Collectors.toList());
    }
}
