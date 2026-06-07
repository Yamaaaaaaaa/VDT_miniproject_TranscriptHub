package org.transhub.controller;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.web.bind.annotation.*;
import org.transhub.dto.request.RoleRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.RoleResponse;
import org.transhub.service.RoleService;

import java.util.List;

@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class RoleController {

    RoleService roleService;

    @GetMapping
    public ApiResponse<List<RoleResponse>> getAllRoles() {
        List<RoleResponse> result = roleService.getAllRoles();
        return ApiResponse.<List<RoleResponse>>builder().result(result).build();
    }

    @GetMapping("/{name}")
    public ApiResponse<RoleResponse> getRoleByName(@PathVariable String name) {
        RoleResponse result = roleService.getRoleByName(name);
        return ApiResponse.<RoleResponse>builder().result(result).build();
    }

    @PostMapping
    public ApiResponse<RoleResponse> createRole(@RequestBody RoleRequest request) {
        RoleResponse result = roleService.createRole(request);
        return ApiResponse.<RoleResponse>builder().result(result).build();
    }

    @DeleteMapping("/{name}")
    public ApiResponse<Void> deleteRole(@PathVariable String name) {
        roleService.deleteRole(name);
        return ApiResponse.<Void>builder().build();
    }
}
