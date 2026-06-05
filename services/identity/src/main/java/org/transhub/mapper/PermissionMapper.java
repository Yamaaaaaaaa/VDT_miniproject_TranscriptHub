package org.transhub.mapper;

import org.mapstruct.Mapper;
import org.transhub.dto.request.PermissionRequest;
import org.transhub.dto.response.PermissionResponse;
import org.transhub.entity.Permission;


@Mapper(componentModel = "spring")
public interface PermissionMapper {
    Permission toPermission(PermissionRequest request);

    PermissionResponse toPermissionResponse(Permission permission);
}
