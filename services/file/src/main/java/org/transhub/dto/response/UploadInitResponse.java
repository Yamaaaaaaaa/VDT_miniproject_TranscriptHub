package org.transhub.dto.response;

import lombok.*;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadInitResponse {
    private UUID fileId;
    private Long chunkSize;
    private String presignedUrl;
}
