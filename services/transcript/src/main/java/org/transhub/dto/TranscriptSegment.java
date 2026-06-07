package org.transhub.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TranscriptSegment {
    private String id;
    private Double startTime; // in seconds
    private Double endTime; // in seconds
    private String speaker;
    private String text;
}
