package org.transhub.controller;


import org.springframework.web.bind.annotation.*;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.request.UserCreationRequest;
import org.transhub.dto.request.UserUpdateRequest;
import org.transhub.dto.response.UserResponse;
import org.transhub.service.UserService;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class InternalUserController {
    private final UserService userService;

    /**
     * POST /internal/users
     * Được gọi bởi identity-service sau khi đăng ký/đăng nhập Google.
     * userId trong request là Long id từ identity-service.
     */
    @PostMapping("/internal/users")
    public ApiResponse<UserResponse> createUser(@RequestBody UserCreationRequest request) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.createUser(request))
                .build();
    }

    /**
     * GET /internal/users/{userId}
     * Tra cứu profile theo Long id (dùng bởi book-service, order-service).
     */
    @GetMapping("/internal/users/{userId}")
    public ApiResponse<UserResponse> getUser(@PathVariable Long userId) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.getUserById(userId))
                .build();
    }

    /**
     * GET /internal/users/by-email
     * Tra cứu profile theo email.
     */
    @GetMapping("/internal/users/by-email")
    public ApiResponse<UserResponse> getUserByEmail(@RequestParam("email") String email) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.getMyProfile(email))
                .build();
    }

    /**
     * PUT /internal/users/{userId}
     * Cập nhật profile theo Long id (dùng bởi identity-service).
     */
    @PutMapping("/internal/users/{userId}")
    public ApiResponse<UserResponse> updateProfile(
            @PathVariable Long userId,
            @RequestBody UserUpdateRequest request) {
        return ApiResponse.<UserResponse>builder()
                .result(userService.updateProfileById(userId, request))
                .build();
    }
}
