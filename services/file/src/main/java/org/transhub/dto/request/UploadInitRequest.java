package org.transhub.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadInitRequest {
    @NotBlank(message = "File name is required")
    private String fileName;

    @NotNull(message = "File size is required")
    private Long fileSize;

    @NotBlank(message = "Mime type is required")
    private String mimeType;
}
