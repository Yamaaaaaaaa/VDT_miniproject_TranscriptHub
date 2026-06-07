package org.transhub.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TranscriptResponse {
    Long id;
    UUID audioFileId;
    String rawText;
    com.fasterxml.jackson.databind.JsonNode structuredContent;
    String status;
    LocalDateTime createdAt;
    LocalDateTime updatedAt;
}
