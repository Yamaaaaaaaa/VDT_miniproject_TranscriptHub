package org.transhub.config;


import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import lombok.extern.slf4j.Slf4j;
import org.transhub.entity.User;
import org.transhub.repository.UserRepository;

@Configuration
@Slf4j
public class ApplicationInitConfig {

    static final String ADMIN_USER_NAME = "admin";

    @Bean
    ApplicationRunner applicationRunner(UserRepository userRepository) {
        log.info("Initializing user-service application.....");
        return args -> {
            if (userRepository.findByUsername(ADMIN_USER_NAME).isEmpty()) {
                log.info("Creating default admin profile in user-service.....");
                User admin = User.builder()
                        .username(ADMIN_USER_NAME)
                        .email(ADMIN_USER_NAME + "@gmail.com")
                        .firstName("System")
                        .lastName("Admin")
                        .status(User.UserStatus.ENABLE)
                        .build();
                userRepository.save(admin);
                log.info("Admin profile has been created successfully in user-service.");
            }
            log.info("User-service application initialization completed.");
        };
    }
}
