package org.transhub.service;


import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.stereotype.Service;
import org.transhub.dto.request.IntrospectRequest;
import org.transhub.dto.response.ApiResponse;
import org.transhub.dto.response.IntrospectResponse;
import org.transhub.repository.IdentityClient;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class IdentityService {
    IdentityClient identityClient;

    public Mono<ApiResponse<IntrospectResponse>> introspect(String token){
        return identityClient.introspect(IntrospectRequest.builder()
                .token(token)
                .tokenType("ACCESS")
                .build());
    }
}
