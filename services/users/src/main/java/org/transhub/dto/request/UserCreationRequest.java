package org.transhub.dto.request;

import java.time.LocalDate;
import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UserCreationRequest {
    Long userId;
    String username;
    String email;
    String firstName;
    String lastName;
    LocalDate dob;
    String phone;
    String city;
}
