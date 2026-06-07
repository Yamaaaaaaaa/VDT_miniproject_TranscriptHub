package org.transhub.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import org.transhub.client.FileClient;
import org.transhub.dto.TranscriptSegment;
import org.transhub.dto.TranscriptionResult;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.FileMetadataResponse;

import java.io.InputStream;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiTranscriptionService {

    private final FileClient fileClient;

    @Value("${app.gemini.api-key}")
    private String apiKey;

    @Value("${app.gemini.model:gemini-2.5-flash}")
    private String modelName;

    public TranscriptionResult transcribe(UUID fileId) {
        log.info("Starting AI transcription using Google Gemini ({}) for fileId: {}", modelName, fileId);
        
        if (apiKey == null || apiKey.trim().isEmpty() || "your_actual_gemini_api_key_here".equals(apiKey)) {
            log.error("Gemini API Key is not configured or has default value. Please configure GEMINI_API_KEY.");
            throw new IllegalStateException("Gemini API Key is not configured correctly.");
        }

        String mimeType = "audio/mp3";
        try {
            ApiResponse<FileMetadataResponse> fileResponse = fileClient.getMetadata(fileId);
            if (fileResponse != null && fileResponse.getResult() != null) {
                String fileMime = fileResponse.getResult().getMimeType();
                if (fileMime != null && !fileMime.trim().isEmpty()) {
                    mimeType = fileMime;
                }
            }
        } catch (Exception e) {
            log.warn("Could not retrieve file metadata from file-service for fileId: {}. Using fallback mimeType.", fileId, e);
        }

        try (feign.Response downloadResponse = fileClient.downloadFile(fileId)) {
            if (downloadResponse.status() != 200) {
                throw new RuntimeException("Failed to download file from file-service. HTTP status: " + downloadResponse.status());
            }

            byte[] fileBytes;
            log.info("Downloading file bytes for fileId: {}", fileId);
            try (InputStream inputStream = downloadResponse.body().asInputStream()) {
                fileBytes = inputStream.readAllBytes();
            }

            String base64Audio = Base64.getEncoder().encodeToString(fileBytes);
            log.info("Successfully encoded audio to Base64 (length: {} characters)", base64Audio.length());

            String systemPrompt = "Transcribe the following audio file. Return a JSON object matching this schema exactly:\n" +
                                  "{\n" +
                                  "  \"rawText\": \"the full concatenated transcription text\",\n" +
                                  "  \"segments\": [\n" +
                                  "    {\n" +
                                  "      \"id\": \"seg-1\",\n" +
                                  "      \"startTime\": 0.0,\n" +
                                  "      \"endTime\": 5.2,\n" +
                                  "      \"speaker\": \"Speaker 1\",\n" +
                                  "      \"text\": \"segment text content\"\n" +
                                  "    }\n" +
                                  "  ]\n" +
                                  "}\n" +
                                  "Requirements:\n" +
                                  "1. Split the transcription into logical segments based on speaker turns or natural pauses. Each segment must have startTime, endTime (in seconds), a speaker label (e.g. Speaker 1, Speaker 2), and the text.\n" +
                                  "2. Transcribe in the original language spoken in the audio.\n" +
                                  "3. Return ONLY valid JSON. Do not include markdown code block formatting (like ```json).";

            GeminiRequest.Part promptPart = new GeminiRequest.Part();
            promptPart.setText(systemPrompt);

            GeminiRequest.InlineData inlineData = new GeminiRequest.InlineData();
            inlineData.setMimeType(mimeType);
            inlineData.setData(base64Audio);

            GeminiRequest.Part audioPart = new GeminiRequest.Part();
            audioPart.setInlineData(inlineData);

            GeminiRequest.Content content = new GeminiRequest.Content();
            content.setParts(List.of(promptPart, audioPart));

            GeminiRequest.GenerationConfig genConfig = new GeminiRequest.GenerationConfig();
            genConfig.setResponseMimeType("application/json");

            GeminiRequest requestPayload = new GeminiRequest();
            requestPayload.setContents(List.of(content));
            requestPayload.setGenerationConfig(genConfig);

            RestTemplate restTemplate = new RestTemplate();
            String geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<GeminiRequest> requestEntity = new HttpEntity<>(requestPayload, headers);
            log.info("Sending request to Gemini API for fileId: {}", fileId);
            
            ResponseEntity<String> responseEntity = restTemplate.postForEntity(geminiUrl, requestEntity, String.class);
            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                ObjectMapper mapper = new ObjectMapper();
                mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
                
                GeminiResponse geminiResponse = mapper.readValue(responseEntity.getBody(), GeminiResponse.class);
                if (geminiResponse.getCandidates() != null && !geminiResponse.getCandidates().isEmpty()) {
                    GeminiResponse.Candidate candidate = geminiResponse.getCandidates().get(0);
                    if (candidate.getContent() != null && candidate.getContent().getParts() != null && !candidate.getContent().getParts().isEmpty()) {
                        String jsonText = candidate.getContent().getParts().get(0).getText();
                        
                        TranscriptionResult result = mapper.readValue(jsonText, TranscriptionResult.class);
                        log.info("Completed AI transcription using Gemini for fileId: {}. Extracted {} segments.", fileId, result.getSegments() != null ? result.getSegments().size() : 0);
                        return result;
                    }
                }
                throw new RuntimeException("No candidates returned from Gemini API");
            } else {
                throw new RuntimeException("Gemini API returned non-success code: " + responseEntity.getStatusCode());
            }

        } catch (Exception e) {
            log.error("Failed to transcribe fileId: {}", fileId, e);
            throw new RuntimeException("Transcription failed", e);
        }
    }

    @Data
    public static class GeminiRequest {
        private List<Content> contents;
        private GenerationConfig generationConfig;

        @Data
        public static class Content {
            private List<Part> parts;
        }

        @Data
        @JsonInclude(JsonInclude.Include.NON_NULL)
        public static class Part {
            private String text;
            private InlineData inlineData;
        }

        @Data
        public static class InlineData {
            private String mimeType;
            private String data;
        }

        @Data
        public static class GenerationConfig {
            private String responseMimeType;
        }
    }

    @Data
    public static class GeminiResponse {
        private List<Candidate> candidates;

        @Data
        public static class Candidate {
            private Content content;
        }

        @Data
        public static class Content {
            private List<Part> parts;
        }

        @Data
        public static class Part {
            private String text;
        }
    }
}
