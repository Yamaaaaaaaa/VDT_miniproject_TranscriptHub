package org.transhub.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.transhub.client.FileClient;
import org.transhub.dto.TranscriptContent;
import org.transhub.dto.TranscriptionResult;
import org.transhub.dto.response.ApiResponse;
import org.transhub.entity.Transcript;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.repository.TranscriptRepository;

import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class TranscriptService {

    private final TranscriptRepository transcriptRepository;
    private final AiTranscriptionService aiTranscriptionService;
    private final FileClient fileClient;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private String toJsonString(Object obj) {
        try {
            return OBJECT_MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            log.error("Failed to serialize object to JSON", e);
            return "{\"segments\":[]}";
        }
    }

    public Transcript getTranscriptByAudioFileId(UUID audioFileId) {
        log.info("Fetching transcript for audioFileId: {}", audioFileId);
        return transcriptRepository.findByAudioFileId(audioFileId)
                .orElseThrow(() -> new AppException(ErrorCode.TRANSCRIPT_NOT_FOUND));
    }

    public java.util.List<Transcript> getAllTranscripts() {
        log.info("Fetching all transcripts");
        return transcriptRepository.findAll();
    }

    @Transactional
    public void generateTranscriptAsync(UUID fileId) {
        log.info("Checking transcript status for fileId: {}", fileId);
        // Check tồn tại. => Chuyển trạng thái thành PROCESSING rồi tiến hành xây dựng transcript
        Transcript transcript = transcriptRepository.findByAudioFileId(fileId).orElse(null);

        if (transcript == null) {
            transcript = Transcript.builder()
                    .audioFileId(fileId)
                    .status("PROCESSING")
                    .rawText("")
                    .structuredContent(toJsonString(new TranscriptContent(new java.util.ArrayList<>())))
                    .build();
            transcript = transcriptRepository.save(transcript);
            triggerBackgroundTranscription(fileId, transcript.getId());
        } else if ("FAILED".equalsIgnoreCase(transcript.getStatus())) {
            transcript.setStatus("PROCESSING");
            transcript = transcriptRepository.save(transcript);
            triggerBackgroundTranscription(fileId, transcript.getId());
        } else {
            log.info("Transcript for fileId: {} already exists in state: {}", fileId, transcript.getStatus());
        }
    }

    @Transactional
    public Transcript generateTranscriptManually(UUID fileId) {
        log.info("Manually requesting transcript generation for fileId: {}", fileId);
        
        // Verify file exists
        try {
            ApiResponse<Boolean> existsResponse = fileClient.checkFileExists(fileId);
            if (existsResponse == null || existsResponse.getResult() == null || !existsResponse.getResult()) {
                log.warn("Manual transcript request failed: file does not exist. ID: {}", fileId);
                throw new AppException(ErrorCode.AUDIO_FILE_NOT_FOUND);
            }
        } catch (AppException ae) {
            throw ae;
        } catch (Exception e) {
            log.error("Failed to check file existence in file-service", e);
            throw new AppException(ErrorCode.AUDIO_FILE_NOT_FOUND);
        }

        Transcript transcript = transcriptRepository.findByAudioFileId(fileId).orElse(null);

        if (transcript == null) {
            transcript = Transcript.builder()
                    .audioFileId(fileId)
                    .status("PROCESSING")
                    .rawText("")
                    .structuredContent(toJsonString(new TranscriptContent(new java.util.ArrayList<>())))
                    .build();
            transcript = transcriptRepository.save(transcript);
            triggerBackgroundTranscription(fileId, transcript.getId());
        } else if ("FAILED".equalsIgnoreCase(transcript.getStatus())) {
            transcript.setStatus("PROCESSING");
            transcript = transcriptRepository.save(transcript);
            triggerBackgroundTranscription(fileId, transcript.getId());
        } else {
            log.info("Transcript for fileId: {} already exists in state: {}", fileId, transcript.getStatus());
        }

        return transcript;
    }



    private void triggerBackgroundTranscription(UUID fileId, Long transcriptId) {
        CompletableFuture.runAsync(() -> {
            log.info("Background thread started transcription for fileId: {}, transcriptId: {}", fileId, transcriptId);
            try {
                TranscriptionResult result = aiTranscriptionService.transcribe(fileId);
                TranscriptContent content = TranscriptContent.builder()
                        .segments(result.getSegments())
                        .build();
                updateTranscriptStatus(transcriptId, "COMPLETED", result.getRawText(), content);
            } catch (Exception e) {
                log.error("Failed to transcribe fileId: {}, transcriptId: {}", fileId, transcriptId, e);
                updateTranscriptStatus(transcriptId, "FAILED", "", new TranscriptContent(new java.util.ArrayList<>()));
            }
        });
    }

    private void updateTranscriptStatus(Long transcriptId, String status, String rawText, TranscriptContent structuredContent) {
        try {
            // Retrieve and save in a separate transaction block or find directly and save
            Transcript transcript = transcriptRepository.findById(transcriptId).orElse(null);
            if (transcript != null) {
                transcript.setStatus(status);
                transcript.setRawText(rawText);
                transcript.setStructuredContent(toJsonString(structuredContent));
                transcriptRepository.save(transcript);
                log.info("Updated transcript ID: {} to status: {}", transcriptId, status);
            } else {
                log.error("Could not find transcript ID: {} to update status", transcriptId);
            }
        } catch (Exception e) {
            log.error("Error updating transcript ID: {} status in DB", transcriptId, e);
        }
    }
}
