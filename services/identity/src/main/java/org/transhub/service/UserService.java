package org.transhub.service;

import lombok.AccessLevel;
import lombok.experimental.FieldDefaults;
import org.transhub.dto.request.ProfileCreationRequest;
import org.transhub.dto.request.ProfileUpdateRequest;
import org.transhub.dto.request.UserCreationRequest;
import org.transhub.dto.request.UserUpdateRequest;
import org.transhub.dto.response.UserResponse;
import org.transhub.entity.Role;
import org.transhub.entity.User;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.mapper.UserMapper;
import org.transhub.repository.RoleRepository;
import org.transhub.repository.UserRepository;
import org.transhub.repository.httpClient.ProfileClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;

@Service
@RequiredArgsConstructor
@Slf4j
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final ProfileClient profileClient;

    @Transactional(readOnly = true)
    public Page<UserResponse> getAllUsers(String keyword, String status, String roleId, Pageable pageable) {
        Page<User> users;
        if (keyword != null && !keyword.trim().isEmpty()) {
            users = userRepository.findByUsernameContainingIgnoreCaseOrEmailContainingIgnoreCase(keyword, keyword, pageable);
        } else {
            users = userRepository.findAll(pageable);
        }
        return users.map(userMapper::toUserResponse);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        return userMapper.toUserResponse(user);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserByEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        return userMapper.toUserResponse(user);
    }

    @Transactional
    public UserResponse createUser(UserCreationRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new AppException(ErrorCode.EMAIL_EXISTED);
        }

        User user = userMapper.toUser(request);
        user.setPassword(passwordEncoder.encode(request.getPassword()));

        if (request.getCity() != null) {
            // map roles if present
            Role userRole = roleRepository.findByName("USER");
            user.setRoles(new HashSet<>());
            if (userRole != null) user.getRoles().add(userRole);
        }

        User savedUser = userRepository.save(user);

        // Gọi user-service để tạo profile
        ProfileCreationRequest profileRequest = ProfileCreationRequest.builder()
                .userId(savedUser.getId())
                .username(savedUser.getUsername())
                .email(savedUser.getEmail())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .dob(request.getDob())
                .build();
        try {
            profileClient.createProfile(profileRequest);
        } catch (Exception e) {
            log.error("Failed to create profile for user: " + savedUser.getUsername(), e);
        }

        return userMapper.toUserResponse(savedUser);
    }

    @Transactional
    public UserResponse updateUser(Long id, UserUpdateRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        userMapper.updateUser(user, request);
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        if (request.getRoles() != null) {
            var roles = roleRepository.findAllById(request.getRoles());
            user.setRoles(new HashSet<>(roles));
        }

        User updatedUser = userRepository.save(user);

        // Gọi user-service để update profile
        ProfileUpdateRequest profileRequest = ProfileUpdateRequest.builder()
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .dob(request.getDob())
                .build();
        try {
            profileClient.updateProfile(updatedUser.getId(), profileRequest);
        } catch (Exception e) {
            log.error("Failed to update profile for user: " + updatedUser.getUsername(), e);
        }

        return userMapper.toUserResponse(updatedUser);
    }

    @Transactional
    public void deleteUser(Long id) {
        if (!userRepository.existsById(id)) {
            throw new AppException(ErrorCode.USER_NOT_EXISTED);
        }
        userRepository.deleteById(id);
    }
}
