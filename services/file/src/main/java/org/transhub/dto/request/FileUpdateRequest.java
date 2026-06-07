package org.transhub.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileUpdateRequest {
    @NotBlank(message = "File name must not be blank")
    private String fileName;
}
