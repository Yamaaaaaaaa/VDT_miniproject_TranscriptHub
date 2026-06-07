package org.transhub.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.transhub.entity.MeetingRole;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberUpdateRequest {

    @NotNull(message = "Role must not be null")
    MeetingRole role;
}
