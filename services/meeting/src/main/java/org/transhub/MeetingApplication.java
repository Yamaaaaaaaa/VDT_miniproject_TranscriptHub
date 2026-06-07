package org.transhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients
public class MeetingApplication {
    public static void main(String[] args) {
        SpringApplication.run(MeetingApplication.class, args);
    }
}
