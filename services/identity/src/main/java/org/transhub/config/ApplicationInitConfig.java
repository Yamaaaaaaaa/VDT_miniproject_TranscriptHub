package org.transhub.config;


import java.util.HashSet;

import org.transhub.constant.PredefinedRole;
import org.transhub.entity.Role;
import org.transhub.entity.User;
import org.transhub.repository.RoleRepository;
import org.transhub.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.transhub.repository.httpClient.ProfileClient;

@Configuration
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ApplicationInitConfig {

    PasswordEncoder passwordEncoder;

    ProfileClient profileClient;

    @NonFinal
    static final String ADMIN_USER_NAME = "admin";

    @NonFinal
    static final String ADMIN_PASSWORD = "admin";

    @Bean
    ApplicationRunner applicationRunner(UserRepository userRepository, RoleRepository roleRepository) {
        log.info("Initializing application.....");
        return args -> {
            if (userRepository.findByUsername(ADMIN_USER_NAME).isEmpty()) {
                log.info("Creating default roles and admin user...");

                roleRepository.save(Role.builder()
                        .name(PredefinedRole.USER_ROLE)
                        .description("User role - Khách hàng")
                        .build());

                Role adminRole = roleRepository.save(Role.builder()
                        .name(PredefinedRole.ADMIN_ROLE)
                        .description("Admin role - Quản trị toàn bộ hệ thống")
                        .build());

                roleRepository.save(Role.builder()
                        .name(PredefinedRole.MANAGER_ROLE)
                        .description("Manager role - Quản lý toàn bộ hệ thống")
                        .build());

                roleRepository.save(Role.builder()
                        .name(PredefinedRole.ORDER_STAFF_ROLE)
                        .description("Order Staff role - Nhân viên xử lý đơn hàng")
                        .build());

                roleRepository.save(Role.builder()
                        .name(PredefinedRole.SERVICE_SUPPORTER_ROLE)
                        .description("Service Supporter role - Nhân viên hỗ trợ khách hàng")
                        .build());

                Role adminLoginRole = roleRepository.save(Role.builder()
                        .name(PredefinedRole.ADMIN_LOGIN_ROLE)
                        .description("Admin Login role - Đăng nhập hệ thống quản trị")
                        .build());

                var roles = new HashSet<Role>();
                roles.add(adminRole);
                roles.add(adminLoginRole);

                User user = User.builder()
                        .username(ADMIN_USER_NAME)
                        .email(ADMIN_USER_NAME + "@gmail.com")
                        .password(passwordEncoder.encode(ADMIN_PASSWORD))
                        .roles(roles)
                        .build();

                User savedAdmin = userRepository.save(user);
                log.warn("admin user has been created with default password: admin, please change it");
            }

            log.info("Application initialization completed .....");
        };
    }
}