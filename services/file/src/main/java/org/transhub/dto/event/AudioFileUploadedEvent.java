package org.transhub.dto.event;


import lombok.*;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AudioFileUploadedEvent {
    private String eventId;
    private String eventType;
    private String timestamp;
    private Payload payload;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Payload {
        private UUID fileId;
        private String fileName;
        private String bucketName;
        private String objectKey;
        private Long fileSize;
        private String mimeType;
        private Integer durationSeconds;
        private Long uploaderId;
    }
}
