package org.transhub.service;

import lombok.AccessLevel;
import lombok.experimental.FieldDefaults;
import org.transhub.dto.request.RoleRequest;
import org.transhub.dto.response.RoleResponse;
import org.transhub.entity.Role;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.mapper.RoleMapper;
import org.transhub.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class RoleService {

    private final RoleRepository roleRepository;
    private final RoleMapper roleMapper;

    @Transactional(readOnly = true)
    public List<RoleResponse> getAllRoles() {
        return roleRepository.findAll().stream()
                .map(roleMapper::toRoleResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RoleResponse getRoleByName(String name) {
        Role role = roleRepository.findById(name)
                .orElseThrow(() -> new AppException(ErrorCode.ROLE_NOT_FOUND));
        return roleMapper.toRoleResponse(role);
    }

    @Transactional
    public RoleResponse createRole(RoleRequest request) {
        if (roleRepository.existsById(request.getName())) {
            throw new AppException(ErrorCode.ROLE_NAME_EXISTED);
        }

        Role role = roleMapper.toRole(request);
        Role savedRole = roleRepository.save(role);
        return roleMapper.toRoleResponse(savedRole);
    }

    @Transactional
    public void deleteRole(String name) {
        Role role = roleRepository.findById(name)
                .orElseThrow(() -> new AppException(ErrorCode.ROLE_NOT_FOUND));
        roleRepository.delete(role);
    }
}
