package org.transhub.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.FileMetadataResponse;

import java.util.UUID;

@FeignClient(name = "file-service", url = "${app.services.file}")
public interface FileClient {

    @GetMapping("/api/v1/files/{fileId}")
    ApiResponse<FileMetadataResponse> getMetadata(@PathVariable("fileId") UUID fileId);

    @GetMapping("/api/v1/files/internal/exists/{fileId}")
    ApiResponse<Boolean> checkFileExists(@PathVariable("fileId") UUID fileId);
}
