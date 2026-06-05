package org.transhub.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.transhub.dto.request.RoleRequest;
import org.transhub.dto.response.RoleResponse;
import org.transhub.entity.Role;

@Mapper(componentModel = "spring")
public interface RoleMapper {
    @Mapping(target = "permissions", ignore = true)
    Role toRole(RoleRequest request);

    RoleResponse toRoleResponse(Role role);
}
