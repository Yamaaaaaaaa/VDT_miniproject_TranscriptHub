package org.transhub.service;

import io.minio.*;
import io.minio.errors.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.transhub.dto.request.FileUpdateRequest;
import org.transhub.repository.AudioFileRepository;


import org.transhub.dto.response.UploadInitResponse;
import org.transhub.entity.AudioFile;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.repository.AudioFileRepository;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.UUID;


@Service
@RequiredArgsConstructor
@Slf4j
public class FileService {

    private final AudioFileRepository audioFileRepository;
    private final MinioClient minioClient;
    private final KafkaProducerService kafkaProducerService;

    @Value("${minio.bucket}")
    private String bucketName;

    @Value("${upload.temp-dir}")
    private String tempDir;

    private static final long DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

    private void ensureBucketExists() {
        try {
            boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!found) {
                log.info("Bucket '{}' not found, creating it.", bucketName);
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
            }
        } catch (Exception e) {
            log.error("Failed to verify/create MinIO bucket", e);
        }
    }

    public AudioFile uploadSingleFile(MultipartFile file, Long uploaderId){
        if(file.isEmpty()) throw new AppException(ErrorCode.FILE_EMPTY);
        ensureBucketExists();

        UUID fileId = UUID.randomUUID();
        String originalFilename = file.getOriginalFilename();
        if(originalFilename == null){
            originalFilename = "audio_" + fileId;
        }
        String objectKey = uploaderId + "/" + fileId + "_" + originalFilename;

        File tempFile = null;
        try{
            // Write to a temporary file to parse duration
            Path tempPath = Files.createTempFile("temp_upload_", "_" + originalFilename);
            tempFile = tempPath.toFile();
            file.transferTo(tempFile);

            long fileSize = tempFile.length();
            String mimeType = file.getContentType();
            if (mimeType == null) {
                mimeType = "audio/mpeg";
            }

            // Upload to MinIO
            try (InputStream is = new BufferedInputStream(new FileInputStream(tempFile))) {
                minioClient.putObject(PutObjectArgs.builder()
                        .bucket(bucketName)
                        .object(objectKey)
                        .stream(is, fileSize, -1)
                        .contentType(mimeType)
                        .build());
            }

            // Extract duration
            int duration = AudioDurationExtractor.extractDuration(tempFile, mimeType);

            AudioFile audioFile = AudioFile.builder()
                    .id(fileId)
                    .fileName(originalFilename)
                    .bucketName(bucketName)
                    .objectKey(objectKey)
                    .fileSize(fileSize)
                    .mimeType(mimeType)
                    .durationSeconds(duration)
                    .status("READY")
                    .uploaderId(uploaderId)
                    .build();

            audioFileRepository.save(audioFile);

            log.info("Successfully uploaded single file: {}. Size: {} bytes, Duration: {}s", originalFilename, fileSize, duration);

            // Trigger Kafka event
            kafkaProducerService.sendAudioFileUploadedEvent(audioFile);

            return audioFile;
        } catch (Exception e) {
            log.error("Failed to upload single file", e);
            throw new AppException(ErrorCode.FILE_UPLOAD_FAILED);
        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    public void streamAudio(UUID fileId, String rangeHeader, HttpServletResponse response) {
        AudioFile audioFile = audioFileRepository.findById(fileId)
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_FOUND));

        if (!"READY".equals(audioFile.getStatus())) {
            throw new AppException(ErrorCode.FILE_NOT_FOUND);
        }

        long fileSize = audioFile.getFileSize();
        String mimeType = audioFile.getMimeType();

        response.setHeader("Accept-Ranges", "bytes");
        response.setContentType(mimeType);

        if (rangeHeader == null || !rangeHeader.startsWith("bytes=")) {
            // Status 200 OK - Stream entire file
            response.setStatus(HttpServletResponse.SC_OK);
            response.setHeader("Content-Length", String.valueOf(fileSize));
            try (InputStream minioStream = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(audioFile.getBucketName())
                    .object(audioFile.getObjectKey())
                    .build());
                 OutputStream out = response.getOutputStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = minioStream.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                out.flush();
            } catch (Exception e) {
                log.error("Failed to stream entire file", e);
                throw new AppException(ErrorCode.FILE_STREAM_FAILED);
            }
        } else {
            // Status 206 Partial Content
            try {
                String rangeValue = rangeHeader.substring(6).trim();
                long start = 0;
                long end = fileSize - 1;

                if (rangeValue.startsWith("-")) {
                    start = fileSize - Long.parseLong(rangeValue.substring(1));
                } else {
                    String[] parts = rangeValue.split("-");
                    start = Long.parseLong(parts[0]);
                    if (parts.length > 1 && !parts[1].isEmpty()) {
                        end = Long.parseLong(parts[1]);
                    }
                }

                if (start < 0 || start >= fileSize || end >= fileSize || start > end) {
                    response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                    response.setHeader("Content-Range", "bytes */" + fileSize);
                    return;
                }

                long contentLength = end - start + 1;
                response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
                response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
                response.setHeader("Content-Length", String.valueOf(contentLength));

                try (InputStream minioStream = minioClient.getObject(GetObjectArgs.builder()
                        .bucket(audioFile.getBucketName())
                        .object(audioFile.getObjectKey())
                        .offset(start)
                        .length(contentLength)
                        .build());
                     OutputStream out = response.getOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = minioStream.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    out.flush();
                }
            } catch (Exception e) {
                log.error("Failed to stream partial content with range header: {}", rangeHeader, e);
                throw new AppException(ErrorCode.FILE_STREAM_FAILED);
            }
        }
    }

    public AudioFile getMetadata(UUID fileId) {
        return audioFileRepository.findById(fileId)
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_FOUND));
    }

    public void deleteFile(UUID fileId, Long uploaderId) {
        AudioFile audioFile = audioFileRepository.findById(fileId)
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_FOUND));

        if (!audioFile.getUploaderId().equals(uploaderId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        try {
            // Delete from MinIO
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(audioFile.getBucketName())
                    .object(audioFile.getObjectKey())
                    .build());
        } catch (Exception e) {
            log.error("Failed to remove file from MinIO: {}", audioFile.getObjectKey(), e);
        }

        // Delete metadata
        audioFileRepository.delete(audioFile);
        log.info("Deleted file and metadata for: {}, fileId: {}", audioFile.getFileName(), fileId);
    }

    public Page<AudioFile> listFiles(Long uploaderId, Pageable pageable) {
        return audioFileRepository.findByUploaderId(uploaderId, pageable);
    }

    public AudioFile updateMetadata(UUID fileId, FileUpdateRequest request, Long uploaderId) {
        AudioFile audioFile = audioFileRepository.findById(fileId)
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_FOUND));

        if (!audioFile.getUploaderId().equals(uploaderId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        audioFile.setFileName(request.getFileName());
        return audioFileRepository.save(audioFile);
    }

    public boolean checkFileExists(UUID fileId) {
        return audioFileRepository.findById(fileId)
                .map(file -> "READY".equals(file.getStatus()))
                .orElse(false);
    }
}
