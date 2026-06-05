package org.transhub.service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.transhub.dto.request.UserCreationRequest;
import org.transhub.dto.request.UserUpdateRequest;
import org.transhub.dto.response.UserResponse;
import org.transhub.entity.User;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.repository.UserRepository;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;

    @Transactional
    public UserResponse createUser(UserCreationRequest userCreationRequest){
        if(userRepository.existsByEmail(userCreationRequest.getEmail())){
            throw new AppException(ErrorCode.USER_EXISTED);
        }
        if(userRepository.existsByUsername(userCreationRequest.getUsername())){
            throw new AppException(ErrorCode.USER_EXISTED);
        }

        User user = User.builder()
                .id(userCreationRequest.getUserId())  // identity-service Long id → user-service Long id
                .username(userCreationRequest.getUsername())
                .email(userCreationRequest.getEmail())
                .firstName(userCreationRequest.getFirstName())
                .lastName(userCreationRequest.getLastName())
                .dob(userCreationRequest.getDob())
                .phone(userCreationRequest.getPhone())
                .status(User.UserStatus.ENABLE)
                .build();

        User userSaved = userRepository.save(user);
        log.info("Created Profile for New User: {}", userSaved.getEmail());
        return mapToResponse(userSaved);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id){
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        return mapToResponse(user);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getAllProfiles() {
        return userRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    /**
     * Lấy profile của chính mình qua email (từ header X-User-Email).
     */
    @Transactional(readOnly = true)
    public UserResponse getMyProfile(String userEmail) {
        if (!StringUtils.hasText(userEmail)) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
        User user = userRepository.findByEmail(userEmail)
                .orElseGet(() -> userRepository.findByUsername(userEmail)
                        .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED)));
        return mapToResponse(user);
    }

    /**
     * Cập nhật profile của chính mình qua email. (từ header X-User-Email).
     */
    @Transactional
    public UserResponse updateMyProfile(String userEmail, UserUpdateRequest request) {
        if (!StringUtils.hasText(userEmail)) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
        User user = userRepository.findByEmail(userEmail)
                .orElseGet(() -> userRepository.findByUsername(userEmail)
                        .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED)));

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new AppException(ErrorCode.EMAIL_EXISTED);
            }
            user.setEmail(request.getEmail());
        }

        if (request.getFirstName() != null) user.setFirstName(request.getFirstName());
        if (request.getLastName() != null) user.setLastName(request.getLastName());
        if (request.getDob() != null) user.setDob(request.getDob());
        if (request.getPhone() != null) user.setPhone(request.getPhone());

        User updatedUser = userRepository.save(user);
        log.info("Updated profile for user: {}", updatedUser.getUsername());
        return mapToResponse(updatedUser);
    }

    /**
     * Cập nhật profile theo Long userId (internal, dùng bởi identity-service nếu cần).
     */
    @Transactional
    public UserResponse updateProfileById(Long userId, UserUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new AppException(ErrorCode.EMAIL_EXISTED);
            }
            user.setEmail(request.getEmail());
        }

        if (request.getFirstName() != null) user.setFirstName(request.getFirstName());
        if (request.getLastName() != null) user.setLastName(request.getLastName());
        if (request.getDob() != null) user.setDob(request.getDob());
        if (request.getPhone() != null) user.setPhone(request.getPhone());

        User updatedUser = userRepository.save(user);
        log.info("Updated profile for user ID {}: {}", userId, updatedUser.getUsername());
        return mapToResponse(updatedUser);
    }

    private UserResponse mapToResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .dob(user.getDob())
                .phone(user.getPhone())
                .build();
    }
}
