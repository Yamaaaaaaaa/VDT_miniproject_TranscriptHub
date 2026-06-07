package org.transhub.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MeetingCreateRequest {

    @NotBlank(message = "Title must not be blank")
    String title;

    String description;

    @NotNull(message = "Audio file ID must not be null")
    UUID audioFileId;
}
