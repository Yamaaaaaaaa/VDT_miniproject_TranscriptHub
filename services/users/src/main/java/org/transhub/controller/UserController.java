package org.transhub.controller;

import org.transhub.dto.request.UserUpdateRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.UserResponse;
import org.transhub.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping("/{id}")
    public ApiResponse<UserResponse> getUser(@PathVariable Long id) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.getUserById(id))
                .build();
    }

    public ApiResponse<List<UserResponse>> getAllUser() {
        return ApiResponse.<List<UserResponse>>builder()
                .result(userService.getAllProfiles())
                .build();
    }

    /**
     * GET /users/my-profile
     * Lấy profile của user hiện tại dựa trên X-User-Email từ gateway.
     */
    @GetMapping("/my-profile")
    public ApiResponse<UserResponse> getMyProfile(
            @RequestHeader(value = "X-User-Email", required = false) String userEmail) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.getMyProfile(userEmail))
                .build();
    }

    /**
     * PUT /users/my-profile
     * Cập nhật profile của user hiện tại.
     */
    @PutMapping("/my-profile")
    public ApiResponse<UserResponse> updateMyProfile(
            @RequestHeader(value = "X-User-Email", required = false) String userEmail,
            @RequestBody UserUpdateRequest request) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.updateMyProfile(userEmail, request))
                .build();
    }
}
