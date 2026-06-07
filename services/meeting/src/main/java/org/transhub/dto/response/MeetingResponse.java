package org.transhub.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;
import org.transhub.entity.MeetingStatus;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MeetingResponse {
    UUID id;
    String title;
    String description;
    Long creatorId;
    UUID audioFileId;
    MeetingStatus status;
    LocalDateTime createdAt;
    LocalDateTime updatedAt;
}
