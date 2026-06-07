package org.transhub.service;


import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.transhub.dto.event.AudioFileUploadedEvent;
import org.transhub.entity.AudioFile;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaProducerService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final String TOPIC = "audio-file-events";

    public void sendAudioFileUploadedEvent(AudioFile audioFile) {
        AudioFileUploadedEvent.Payload payload = AudioFileUploadedEvent.Payload.builder()
                .fileId(audioFile.getId())
                .fileName(audioFile.getFileName())
                .bucketName(audioFile.getBucketName())
                .objectKey(audioFile.getObjectKey())
                .fileSize(audioFile.getFileSize())
                .mimeType(audioFile.getMimeType())
                .durationSeconds(audioFile.getDurationSeconds())
                .uploaderId(audioFile.getUploaderId())
                .build();

        AudioFileUploadedEvent event = AudioFileUploadedEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType("AUDIO_FILE_UPLOAD_COMPLETED")
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .payload(payload)
                .build();

        log.info("Publishing file uploaded event to Kafka topic: {}. Event ID: {}", TOPIC, event.getEventId());
        try {
            kafkaTemplate.send(TOPIC, audioFile.getId().toString(), event);
        } catch (Exception e) {
            log.error("Failed to publish audio file upload completed event to Kafka", e);
        }
    }
}
