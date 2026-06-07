package org.transhub.controller;


import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.transhub.dto.request.FileUpdateRequest;
import org.transhub.dto.request.UploadInitRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.FileMetadataResponse;
import org.transhub.dto.response.UploadInitResponse;
import org.transhub.entity.AudioFile;
import org.transhub.service.FileService;

import io.swagger.v3.oas.annotations.Parameter;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
@Slf4j
public class FileController {

    private final FileService fileService;

    private FileMetadataResponse mapToResponse(AudioFile file) {
        return FileMetadataResponse.builder()
                .id(file.getId())
                .fileName(file.getFileName())
                .bucketName(file.getBucketName())
                .objectKey(file.getObjectKey())
                .fileSize(file.getFileSize())
                .mimeType(file.getMimeType())
                .durationSeconds(file.getDurationSeconds())
                .status(file.getStatus())
                .uploaderId(file.getUploaderId())
                .createdAt(file.getCreatedAt())
                .build();
    }

    // API 1: Upload File Audio (Single upload)
    @PostMapping(value = "/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FileMetadataResponse>> uploadSingleFile(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @RequestParam("file") MultipartFile file) {
        log.info("Received request to upload single file. User ID: {}", uploaderId);
        AudioFile audioFile = fileService.uploadSingleFile(file, uploaderId);
        ApiResponse<FileMetadataResponse> response = ApiResponse.<FileMetadataResponse>builder()
                .result(mapToResponse(audioFile))
                .build();
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // API 1b: Initialize Upload (Presigned URL)
    @PostMapping("/upload/init")
    public ResponseEntity<ApiResponse<UploadInitResponse>> initializeUpload(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @Valid @RequestBody UploadInitRequest request) {
        log.info("Received request to initialize presigned upload. User ID: {}, File: {}", uploaderId, request.getFileName());
        UploadInitResponse initResponse = fileService.initializeUpload(request, uploaderId);
        ApiResponse<UploadInitResponse> response = ApiResponse.<UploadInitResponse>builder()
                .result(initResponse)
                .build();
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // API 1c: Complete Upload (Presigned URL Callback)
    @PostMapping("/upload/complete/{fileId}")
    public ResponseEntity<ApiResponse<FileMetadataResponse>> completeUpload(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @PathVariable("fileId") UUID fileId) {
        log.info("Received complete upload notification for fileId: {}, User ID: {}", fileId, uploaderId);
        AudioFile audioFile = fileService.completeUpload(fileId, uploaderId);
        ApiResponse<FileMetadataResponse> response = ApiResponse.<FileMetadataResponse>builder()
                .result(mapToResponse(audioFile))
                .build();
        return ResponseEntity.ok(response);
    }

    // API 2: Stream Audio supporting Range Requests (HTTP 206)
    @GetMapping("/stream/{fileId}")
    public void streamAudio(
            @PathVariable("fileId") UUID fileId,
            @RequestHeader(value = "Range", required = false) String rangeHeader,
            HttpServletResponse response) {
        log.info("Received streaming request for fileId: {}, Range: {}", fileId, rangeHeader);
        fileService.streamAudio(fileId, rangeHeader, response);
    }

    // Get Metadata
    @GetMapping("/{fileId}")
    public ResponseEntity<ApiResponse<FileMetadataResponse>> getMetadata(@PathVariable("fileId") UUID fileId) {
        log.info("Received request for metadata. File ID: {}", fileId);
        AudioFile audioFile = fileService.getMetadata(fileId);
        ApiResponse<FileMetadataResponse> response = ApiResponse.<FileMetadataResponse>builder()
                .result(mapToResponse(audioFile))
                .build();
        return ResponseEntity.ok(response);
    }

    // Delete File
    @DeleteMapping("/{fileId}")
    public ResponseEntity<ApiResponse<String>> deleteFile(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @PathVariable("fileId") UUID fileId) {
        log.info("Received delete request for fileId: {}, User ID: {}", fileId, uploaderId);
        fileService.deleteFile(fileId, uploaderId);
        ApiResponse<String> response = ApiResponse.<String>builder()
                .result("File deleted successfully")
                .build();
        return ResponseEntity.ok(response);
    }

    // Rename file
    @PutMapping("/{fileId}")
    public ResponseEntity<ApiResponse<FileMetadataResponse>> updateMetadata(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @PathVariable("fileId") UUID fileId,
            @Valid @RequestBody FileUpdateRequest request) {
        log.info("Received rename request for fileId: {}, User ID: {}, New Name: {}", fileId, uploaderId, request.getFileName());
        AudioFile audioFile = fileService.updateMetadata(fileId, request, uploaderId);
        ApiResponse<FileMetadataResponse> response = ApiResponse.<FileMetadataResponse>builder()
                .result(mapToResponse(audioFile))
                .build();
        return ResponseEntity.ok(response);
    }

    // List paginated user files
    @GetMapping
    public ResponseEntity<ApiResponse<Page<FileMetadataResponse>>> listFiles(
            @RequestHeader("X-User-Id") @Parameter(hidden = true) Long uploaderId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size) {
        log.info("Received file list request. User ID: {}, page: {}, size: {}", uploaderId, page, size);
        Page<AudioFile> filesPage = fileService.listFiles(uploaderId, PageRequest.of(page, size));
        Page<FileMetadataResponse> mappedPage = filesPage.map(this::mapToResponse);
        ApiResponse<Page<FileMetadataResponse>> response = ApiResponse.<Page<FileMetadataResponse>>builder()
                .result(mappedPage)
                .build();
        return ResponseEntity.ok(response);
    }

    // Internal Endpoint: check file exists
    @GetMapping("/internal/exists/{fileId}")
    public ResponseEntity<ApiResponse<Boolean>> checkFileExists(@PathVariable("fileId") UUID fileId) {
        log.info("Internal exist check for file ID: {}", fileId);
        boolean exists = fileService.checkFileExists(fileId);
        ApiResponse<Boolean> response = ApiResponse.<Boolean>builder()
                .result(exists)
                .build();
        return ResponseEntity.ok(response);
    }
}
