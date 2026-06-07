package org.transhub.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.transhub.entity.MeetingStatus;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MeetingUpdateRequest {

    @NotBlank(message = "Title must not be blank")
    String title;

    String description;

    MeetingStatus status;
}
