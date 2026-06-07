package org.transhub.controller;

import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.transhub.dto.request.GenerateTranscriptRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.entity.Transcript;
import org.transhub.service.TranscriptService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transcripts")
@RequiredArgsConstructor
@Slf4j
public class TranscriptController {

    private final TranscriptService transcriptService;

    @GetMapping("/file/{audioFileId}")
    public ResponseEntity<ApiResponse<Transcript>> getTranscriptByAudioFile(@PathVariable("audioFileId") UUID audioFileId) {
        log.info("REST request to get transcript for audioFileId: {}", audioFileId);
        Transcript transcript = transcriptService.getTranscriptByAudioFileId(audioFileId);
        ApiResponse<Transcript> response = ApiResponse.<Transcript>builder()
                .result(transcript)
                .build();
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<ApiResponse<java.util.List<Transcript>>> getAllTranscripts() {
        log.info("REST request to get all transcripts");
        java.util.List<Transcript> transcripts = transcriptService.getAllTranscripts();
        ApiResponse<java.util.List<Transcript>> response = ApiResponse.<java.util.List<Transcript>>builder()
                .result(transcripts)
                .build();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<Transcript>> generateTranscript(@RequestBody GenerateTranscriptRequest request) {
        log.info("REST request to generate transcript manually for fileId: {}", request.getFileId());
        Transcript transcript = transcriptService.generateTranscriptManually(request.getFileId());
        ApiResponse<Transcript> response = ApiResponse.<Transcript>builder()
                .result(transcript)
                .build();
        return ResponseEntity.ok(response);
    }


}
