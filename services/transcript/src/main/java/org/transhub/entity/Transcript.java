package org.transhub.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "transcripts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Transcript {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "audio_file_id", unique = true)
    private UUID audioFileId;

    @Column(name = "raw_text", nullable = false, columnDefinition = "TEXT")
    private String rawText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "structured_content", nullable = false, columnDefinition = "jsonb")
    @com.fasterxml.jackson.annotation.JsonRawValue
    @com.fasterxml.jackson.annotation.JsonProperty("structuredContent")
    private String structuredContent;

    @com.fasterxml.jackson.annotation.JsonProperty("structuredContent")
    public void setStructuredContentJson(com.fasterxml.jackson.databind.JsonNode node) {
        if (node == null) {
            this.structuredContent = "{\"segments\":[]}";
        } else {
            this.structuredContent = node.toString();
        }
    }

    @Column(nullable = false, length = 50)
    private String status; // PROCESSING, COMPLETED, FAILED

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
