package org.transhub.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * SecurityConfig - Cấu hình bảo mật cho User Service.

 * Trong kiến trúc microservice này, việc xác thực JWT và phân quyền được
 * xử lý TẬP TRUNG tại API Gateway. User-service nhận các request đã được
 * Gateway xác thực, với thông tin người dùng (email, roles) được truyền
 * qua HTTP Headers (X-User-Email, X-User-Roles).

 * Vì vậy, User-service chỉ cần:
 *  1. Tắt basic auth mặc định của Spring Security
 *  2. Cho phép tất cả requests (Gateway đã kiểm tra rồi)
 *  3. Cung cấp PasswordEncoder bean để mã hóa password khi tạo user
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .anyRequest().permitAll()
                );
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }
}
