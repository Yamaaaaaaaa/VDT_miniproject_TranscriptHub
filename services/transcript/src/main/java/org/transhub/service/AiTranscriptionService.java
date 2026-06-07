package org.transhub.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.transhub.client.FileClient;
import org.transhub.dto.TranscriptSegment;
import org.transhub.dto.TranscriptionResult;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.FileMetadataResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiTranscriptionService {

    private final FileClient fileClient;

    public TranscriptionResult transcribe(UUID fileId) {
        log.info("Starting AI transcription simulation for fileId: {}", fileId);
        
        String fileName = "unknown_file.mp3";
        try {
            ApiResponse<FileMetadataResponse> fileResponse = fileClient.getMetadata(fileId);
            if (fileResponse != null && fileResponse.getResult() != null) {
                fileName = fileResponse.getResult().getFileName();
            }
        } catch (Exception e) {
            log.warn("Could not retrieve file metadata from file-service for fileId: {}. Using fallback name.", fileId, e);
        }

        // Simulate some processing delay to mimic Whisper API call (e.g., 2 seconds)
        try {
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Transcription interrupted", e);
        }

        List<TranscriptSegment> segments = new ArrayList<>();
        segments.add(TranscriptSegment.builder()
                .id("seg-1")
                .startTime(0.0)
                .endTime(5.2)
                .speaker("Speaker 1")
                .text("Xin chào tất cả các thành viên đã tham gia buổi họp ngày hôm nay.")
                .build());

        segments.add(TranscriptSegment.builder()
                .id("seg-2")
                .startTime(5.5)
                .endTime(12.8)
                .speaker("Speaker 1")
                .text("Hôm nay chúng ta sẽ thảo luận về tiến độ dự án TranscriptHub và xem xét file âm thanh " + fileName + ".")
                .build());

        segments.add(TranscriptSegment.builder()
                .id("seg-4")
                .startTime(19.0)
                .endTime(24.5)
                .speaker("Speaker 2")
                .text("Hệ thống có thể tự động nhận diện sự kiện tải lên và bắt đầu quá trình trích xuất transcript này.")
                .build());

        StringBuilder rawTextBuilder = new StringBuilder();
        for (TranscriptSegment segment : segments) {
            if (rawTextBuilder.length() > 0) {
                rawTextBuilder.append(" ");
            }
            rawTextBuilder.append(segment.getText());
        }

        log.info("Completed AI transcription simulation for fileId: {}", fileId);
        return TranscriptionResult.builder()
                .rawText(rawTextBuilder.toString())
                .segments(segments)
                .build();
    }
}
