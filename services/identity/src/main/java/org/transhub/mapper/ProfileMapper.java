package org.transhub.mapper;

import org.mapstruct.Mapper;
import org.transhub.dto.request.ProfileCreationRequest;
import org.transhub.dto.request.UserCreationRequest;

@Mapper(componentModel = "spring")
public interface ProfileMapper {
    ProfileCreationRequest toProfileCreationRequest(UserCreationRequest request);
}
