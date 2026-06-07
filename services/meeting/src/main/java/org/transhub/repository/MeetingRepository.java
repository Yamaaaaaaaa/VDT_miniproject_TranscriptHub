package org.transhub.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.transhub.entity.Meeting;

import java.util.UUID;

@Repository
public interface MeetingRepository extends JpaRepository<Meeting, UUID> {

    @Query("SELECT m FROM Meeting m WHERE m.id IN (SELECT mm.meetingId FROM MeetingMember mm WHERE mm.userId = :userId)")
    Page<Meeting> findMeetingsByUserId(@Param("userId") Long userId, Pageable pageable);

    boolean existsByAudioFileId(UUID audioFileId);
}
