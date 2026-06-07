package org.transhub.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.UserResponse;

@FeignClient(name = "user-service", url = "${app.services.user}")
public interface UserClient {

    @GetMapping("/internal/users/by-email")
    ApiResponse<UserResponse> getUserByEmail(@RequestParam("email") String email);

    @GetMapping("/internal/users/{userId}")
    ApiResponse<UserResponse> getUserById(@org.springframework.web.bind.annotation.PathVariable("userId") Long userId);
}
