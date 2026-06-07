package org.transhub.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;
import org.transhub.entity.MeetingRole;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MeetingMemberResponse {
    Long id;
    UUID meetingId;
    Long userId;
    MeetingRole role;
    LocalDateTime joinedAt;
}
