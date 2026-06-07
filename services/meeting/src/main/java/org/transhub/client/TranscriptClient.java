package org.transhub.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.TranscriptResponse;

import java.util.UUID;

@FeignClient(name = "transcript-service", url = "${app.services.transcript}")
public interface TranscriptClient {

    @GetMapping("/api/v1/transcripts/file/{audioFileId}")
    ApiResponse<TranscriptResponse> getTranscriptByAudioFile(@PathVariable("audioFileId") UUID audioFileId);
}
