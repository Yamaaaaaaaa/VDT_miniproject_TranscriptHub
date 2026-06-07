package org.transhub.controller;

import jakarta.validation.Valid;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;
import org.transhub.dto.request.UserCreationRequest;
import org.transhub.dto.request.UserUpdateRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.UserResponse;
import org.transhub.service.UserService;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class UserController {

    UserService userService;

    @GetMapping
    public ApiResponse<Page<UserResponse>> getAllUsers(
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "roleId", required = false) String roleId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "100") int size) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<UserResponse> result = userService.getAllUsers(keyword, status, roleId, pageable);
        return ApiResponse.<Page<UserResponse>>builder().result(result).build();
    }

    @GetMapping("/{id}")
    public ApiResponse<UserResponse> getUserById(@PathVariable Long id) {
        UserResponse result = userService.getUserById(id);
        return ApiResponse.<UserResponse>builder().result(result).build();
    }

    @PostMapping
    public ApiResponse<UserResponse> createUser(@RequestBody @Valid UserCreationRequest request) {
        UserResponse result = userService.createUser(request);
        return ApiResponse.<UserResponse>builder().result(result).build();
    }

    @PutMapping("/{id}")
    public ApiResponse<UserResponse> updateUser(@PathVariable Long id, @RequestBody @Valid UserUpdateRequest request) {
        UserResponse result = userService.updateUser(id, request);
        return ApiResponse.<UserResponse>builder().result(result).build();
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ApiResponse.<Void>builder().build();
    }
}
