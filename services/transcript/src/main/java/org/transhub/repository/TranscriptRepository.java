package org.transhub.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.transhub.entity.Transcript;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TranscriptRepository extends JpaRepository<Transcript, Long> {

    Optional<Transcript> findByAudioFileId(UUID audioFileId);

    boolean existsByAudioFileId(UUID audioFileId);
}
