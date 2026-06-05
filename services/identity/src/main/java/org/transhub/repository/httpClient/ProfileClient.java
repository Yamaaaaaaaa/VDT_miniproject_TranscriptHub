package org.transhub.repository.httpClient;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.transhub.config.AuthenticationRequestInterceptor;
import org.transhub.dto.request.ProfileCreationRequest;
import org.transhub.dto.request.ProfileUpdateRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.UserProfileResponse;


@FeignClient(
        name = "user-service",
        url = "${app.services.user}",
        configuration = {AuthenticationRequestInterceptor.class}) // Tư động truyền Auth Header từ Request hiện tại đến Requst Feign gọi sang Service khác
public interface ProfileClient {

    @PostMapping(value = "/internal/users", produces = MediaType.APPLICATION_JSON_VALUE)
    ApiResponse<UserProfileResponse> createProfile(@RequestBody ProfileCreationRequest request);

    @PutMapping(value = "/internal/users/{userId}", produces = MediaType.APPLICATION_JSON_VALUE)
    ApiResponse<UserProfileResponse> updateProfile(@PathVariable("userId") Long userId, @RequestBody ProfileUpdateRequest request);

    @org.springframework.web.bind.annotation.GetMapping(value = "/users/my-profile", produces = MediaType.APPLICATION_JSON_VALUE)
    ApiResponse<UserProfileResponse> getProfileByEmail(@RequestHeader("X-User-Email") String email);
}
