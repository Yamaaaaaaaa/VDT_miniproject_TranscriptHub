package org.transhub.service;


import com.mpatric.mp3agic.Mp3File;
import lombok.extern.slf4j.Slf4j;

import javax.sound.sampled.AudioFileFormat;
import javax.sound.sampled.AudioSystem;
import java.io.File;

@Slf4j
public class AudioDurationExtractor {

    public static int extractDuration(File file, String mimeType) {
        if (file == null || !file.exists()) {
            return 0;
        }
        try {
            String name = file.getName().toLowerCase();
            if (name.endsWith(".wav") || (mimeType != null && (mimeType.contains("wav") || mimeType.contains("wave")))) {
                AudioFileFormat fileFormat = AudioSystem.getAudioFileFormat(file);
                float frameRate = fileFormat.getFormat().getFrameRate();
                long frameLength = fileFormat.getFrameLength();
                if (frameRate > 0 && frameLength > 0) {
                    return Math.round(frameLength / frameRate);
                }
            } else if (name.endsWith(".mp3") || (mimeType != null && mimeType.contains("mp3"))) {
                Mp3File mp3File = new Mp3File(file);
                return (int) mp3File.getLengthInSeconds();
            }
        } catch (Exception e) {
            log.warn("Failed to extract audio duration for file: {}. Error: {}", file.getName(), e.getMessage());
        }
        return 0;
    }
}
