package org.transhub.dto.response;

import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileMetadataResponse {
    private UUID id;
    private String fileName;
    private String bucketName;
    private String objectKey;
    private Long fileSize;
    private String mimeType;
    private Integer durationSeconds;
    private String status;
    private Long uploaderId;
    private LocalDateTime createdAt;
}
