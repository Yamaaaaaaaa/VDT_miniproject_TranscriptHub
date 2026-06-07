package org.transhub.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.transhub.entity.MeetingMember;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MeetingMemberRepository extends JpaRepository<MeetingMember, Long> {

    List<MeetingMember> findByMeetingId(UUID meetingId);

    Optional<MeetingMember> findByMeetingIdAndUserId(UUID meetingId, Long userId);

    boolean existsByMeetingIdAndUserId(UUID meetingId, Long userId);
}
