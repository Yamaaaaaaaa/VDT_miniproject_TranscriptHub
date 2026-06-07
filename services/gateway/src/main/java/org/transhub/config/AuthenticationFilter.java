package org.transhub.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.web.server.ServerWebExchange;
import org.transhub.dto.response.ApiResponse;
import org.transhub.service.IdentityService;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.List;

@Component
@Slf4j
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PACKAGE, makeFinal = true)
public class AuthenticationFilter implements GlobalFilter, Ordered {

    IdentityService identityService;
    ObjectMapper objectMapper;

    @NonFinal
    private String[] publicEndpoints = {
            "/auth/.*",
            "/swagger-ui.html",
            "/swagger-ui/.*",
            "/v3/api-docs.*",
            "/identity-service/v3/api-docs",
            "/user-service/v3/api-docs",
            "/book-service/v3/api-docs",
            "/search-service/v3/api-docs",
            "/event-service/v3/api-docs",
            "/file-service/v3/api-docs",
            "/notification-service/v3/api-docs",
            "/order-service/v3/api-docs",
            "/chat-service/v3/api-docs",
            "/ws/.*",
            "/chat-ws/.*",
            "/api/v1/files/stream/.*",
    };

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        log.info("Enter authentication filter....");

        if (isPublicEndpoint(exchange.getRequest())) {
            return chain.filter(exchange);
        }

        // Get token from authorization header
        List<String> authHeader = exchange.getRequest().getHeaders().get(HttpHeaders.AUTHORIZATION);
        if (CollectionUtils.isEmpty(authHeader)) {
            return unauthenticated(exchange.getResponse());
        }

        String token = authHeader.get(0).replace("Bearer ", "");
        log.info("Token: {}", token);

        return identityService.introspect(token).flatMap(introspectResponse -> {
            if (introspectResponse.getResult().isValid()) {
                // Decrypt and extract email and roles from JWT token to forward downstream
                try {
                    String[] parts = token.split("\\.");
                    if (parts.length >= 2) {
                        String payload = new String(java.util.Base64.getUrlDecoder().decode(parts[1]));
                        JsonNode jwtPayload = objectMapper.readTree(payload);
                        String email = jwtPayload.has("sub") ? jwtPayload.get("sub").asText() : "";
                        String scope = jwtPayload.has("scope") ? jwtPayload.get("scope").asText() : "";
                        String userId = jwtPayload.has("userId") ? jwtPayload.get("userId").asText() : "";

                        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                                .header("X-User-Email", email)
                                .header("X-User-Roles", scope)
                                .header("X-User-Id", userId)
                                .build();
                        return chain.filter(exchange.mutate().request(mutatedRequest).build());
                    }
                } catch (Exception e) {
                    log.error("Failed to parse JWT token on Gateway", e);
                }
                return chain.filter(exchange);
            } else {
                return unauthenticated(exchange.getResponse());
            }
        }).onErrorResume(throwable -> {
            log.error("Authentication introspect error", throwable);
            return unauthenticated(exchange.getResponse());
        });
    }

    @Override
    public int getOrder() {
        return -1;
    }

    private boolean isPublicEndpoint(ServerHttpRequest request) {
        String path = request.getURI().getPath();
        return Arrays.stream(publicEndpoints)
                .anyMatch(path::matches);
    }

    Mono<Void> unauthenticated(ServerHttpResponse response) {
        ApiResponse<?> apiResponse = ApiResponse.builder()
                .code(1401)
                .message("Unauthenticated")
                .build();

        String body = null;
        try {
            body = objectMapper.writeValueAsString(apiResponse);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }

        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().add(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);

        return response.writeWith(
                Mono.just(response.bufferFactory().wrap(body.getBytes())));
    }
}
