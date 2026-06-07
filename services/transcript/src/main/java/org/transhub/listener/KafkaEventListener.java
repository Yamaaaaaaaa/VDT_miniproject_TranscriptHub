package org.transhub.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.transhub.dto.event.AudioFileUploadedEvent;
import org.transhub.service.TranscriptService;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaEventListener {

    private final TranscriptService transcriptService;

    @KafkaListener(topics = "audio-file-events", groupId = "transcript-group")
    public void listenAudioFileUploaded(AudioFileUploadedEvent event) {
        log.info("Received AudioFileUploadedEvent from Kafka: {}", event);
        if (event.getPayload() != null && event.getPayload().getFileId() != null) {
            log.info("Triggering async transcript generation for fileId: {}", event.getPayload().getFileId());
            transcriptService.generateTranscriptAsync(event.getPayload().getFileId());
        } else {
            log.warn("Received Kafka event with null payload or fileId");
        }
    }
}
