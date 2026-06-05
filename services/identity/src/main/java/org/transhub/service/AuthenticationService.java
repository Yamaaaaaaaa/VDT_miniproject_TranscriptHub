package org.transhub.service;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.transhub.dto.request.*;
import org.transhub.dto.response.AuthenticationResponse;
import org.transhub.dto.response.IntrospectResponse;
import org.transhub.dto.response.LoginResponse;
import org.transhub.dto.response.UserResponse;
import org.transhub.entity.InvalidatedToken;
import org.transhub.entity.Role;
import org.transhub.entity.User;
import org.transhub.exception.AppException;
import org.transhub.exception.ErrorCode;
import org.transhub.mapper.UserMapper;
import org.transhub.repository.InvalidatedTokenRepository;
import org.transhub.repository.RoleRepository;
import org.transhub.repository.UserRepository;
import org.transhub.repository.httpClient.ProfileClient;

import java.text.ParseException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

enum TokenType {
    ACCESS,
    REFRESH
}

@Service
@Slf4j
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AuthenticationService {
    private final UserRepository userRepository;

    private final RoleRepository roleRepository;

    private final InvalidatedTokenRepository invalidatedTokenRepository;

    @NonFinal
    @Value("${jwt.signer-key}")
    protected String SIGNER_KEY;

    @NonFinal
    @Value("${jwt.valid-duration}")
    protected long VALID_DURATION;

    @NonFinal
    @Value("${jwt.refreshable-duration}")
    protected long REFRESHABLE_DURATION;

    private final UserMapper userMapper;

    private final ProfileClient profileClient;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(10);

    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }

        String accessToken = generateToken(user, TokenType.ACCESS);
        String refreshToken = generateToken(user, TokenType.REFRESH);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn((int) VALID_DURATION)
                .tokenType("Bearer")
                .build();
    }

    public LoginResponse adminlogin(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
        System.out.println("role: "+ user.getRoles());
        // Kiểm tra xem user có role ADMIN không
        boolean isAdmin = user.getRoles().stream()
                .anyMatch(role -> "ADMIN_LOGIN".equals(role.getName()));

        if (!isAdmin) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        String accessToken = generateToken(user, TokenType.ACCESS);
        String refreshToken = generateToken(user, TokenType.REFRESH);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn((int) VALID_DURATION)
                .tokenType("Bearer")
                .build();
    }

    // --- Service trả lại AccessToken cho người dùng nhờ Refresh Token
    // Hướng làm 1:
    // Bên Client phải check nếu AccessToken gần hết hạn thì gửi 1 API (/refresh) để lấy Access mới
    // Hướng làm 2:
    // Bên Client nếu gọi Request dính 401 => FE gọi API (/refresh) để lấy token
    public AuthenticationResponse getTokenByRefresh(RefreshRequest request) throws ParseException, JOSEException {
        SignedJWT signedJWT = verifyToken(request.getToken(), "REFRESH");

        var email = signedJWT.getJWTClaimsSet().getSubject();
        var user = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

        var token = generateToken(user, TokenType.ACCESS);

        return AuthenticationResponse.builder().token(token).authenticated(true).build();
    }

    // ---  Service Logout => ko cần trả về j. yêu cầu là nếu có lỗi thì bắn ra Exception => Nhớ Try Catch
    // B1: Verify Token. => Nếu token Invaliated (hết hạn hoặc trong DB Invaliated)
    // B2: Qua đc bước trên => Lưu token đó vào DB Invaliated
    public void logout(LogoutRequest logoutRequest) throws JOSEException, ParseException{
        try {
            var signToken = verifyToken(logoutRequest.getToken(), "REFRESH");

            String jit = signToken.getJWTClaimsSet().getJWTID();
            Date expiryTime = signToken.getJWTClaimsSet().getExpirationTime();

            InvalidatedToken invalidatedToken =
                    InvalidatedToken.builder().id(jit).expiryTime(expiryTime).build();

            invalidatedTokenRepository.save(invalidatedToken);
        } catch (AppException exception) {
            log.info("Token already expired");
        }
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new AppException(ErrorCode.EMAIL_EXISTED);
        }

        Role userRole = roleRepository.findByName("USER");

        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .roles(Set.of(userRole))  // Thêm role USER mặc định
                .build();

        User savedUser = userRepository.save(user);

        // Gọi user-service để tạo profile
        ProfileCreationRequest profileRequest = ProfileCreationRequest.builder()
                .userId(savedUser.getId())
                .username(savedUser.getUsername())
                .email(savedUser.getEmail())
                .firstName("")
                .lastName("")
                .build();
        try {
            profileClient.createProfile(profileRequest);
        } catch (Exception e) {
            log.error("Failed to create profile for registered user: " + savedUser.getUsername(), e);
        }

        return userMapper.toUserResponse(savedUser);
    }

    // --- Cái này để Test API Refresh thôi: Service lấy refreshToken mới: ---
    // B1: Nhận Token => Giải mã Token
    // B2: Cho Token cũ đấy ko sd đc nữa (đưa vào DB Invaliated)
    // B3: Tạo Token mới dựa vào thông tin ng dùng (lấy từ token cũ) => Trả về
    public AuthenticationResponse refreshToken(RefreshRequest refreshRequest) throws JOSEException, ParseException{
        SignedJWT signedJWT = verifyToken(refreshRequest.getToken(), "REFRESH");

        String jid = signedJWT.getJWTClaimsSet().getJWTID();
        var expiryTime = signedJWT.getJWTClaimsSet().getExpirationTime();

        InvalidatedToken invalidatedToken = InvalidatedToken.builder().id(jid).expiryTime(expiryTime).build();
        invalidatedTokenRepository.save(invalidatedToken);

        var name = signedJWT.getJWTClaimsSet().getSubject();
        var user = userRepository.findByUsername(name).orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

        var token = generateToken(user, TokenType.REFRESH);

        return AuthenticationResponse.builder().token(token).authenticated(true).build();
    }

    @Transactional
    public LoginResponse loginWithGoogle(GoogleLoginRequest request) {
        // 1. Verify id_token với Google's public JWKS endpoint
        JwtDecoder googleJwtDecoder = NimbusJwtDecoder
                .withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .build();

        Jwt googleJwt;
        try {
            googleJwt = googleJwtDecoder.decode(request.getIdToken());
        } catch (Exception e) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }

        // 2. Lấy thông tin từ Google JWT payload
        String email = googleJwt.getClaimAsString("email");
        String name  = googleJwt.getClaimAsString("name");
        String given = googleJwt.getClaimAsString("given_name");   // firstName
        String family= googleJwt.getClaimAsString("family_name");  // lastName

        if (email == null) throw new AppException(ErrorCode.UNAUTHENTICATED);

        // 3. Tìm user theo email, nếu chưa có → tạo mới
        User user = userRepository.findByEmail(email).orElseGet(() -> {
            Role userRole = roleRepository.findByName("USER");

            // Username = phần trước @ của email (đảm bảo unique)
            String baseUsername = email.split("@")[0];
            String username = baseUsername;
            int suffix = 1;
            while (userRepository.existsByUsername(username)) {
                username = baseUsername + suffix++;
            }

            // Tạo user mới — password random vì đăng nhập qua Google
            User newUser = User.builder()
                    .email(email)
                    .username(username)
                    .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .roles(userRole != null ? Set.of(userRole) : new HashSet<>())
                    .build();

            User savedUser = userRepository.save(newUser);

            // Gọi user-service để tạo profile
            ProfileCreationRequest profileRequest = ProfileCreationRequest.builder()
                    .userId(savedUser.getId())
                    .username(savedUser.getUsername())
                    .email(savedUser.getEmail())
                    .firstName(given != null ? given : (name != null ? name : username))
                    .lastName(family != null ? family : "")
                    .build();
            try {
                profileClient.createProfile(profileRequest);
            } catch (Exception e) {
                log.error("Failed to create profile for Google user: " + savedUser.getUsername(), e);
            }

            return savedUser;
        });

        // 4. Phát JWT của hệ thống (giống login thường)
        String accessToken  = generateToken(user, TokenType.ACCESS);
        String refreshToken = generateToken(user, TokenType.REFRESH);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn((int) VALID_DURATION)
                .tokenType("Bearer")
                .build();
    }

    // API Check Verify Token
    public IntrospectResponse introspect(IntrospectRequest request) throws JOSEException, ParseException {
        boolean isValid = true;
        try {
            verifyToken(request.getToken(), request.getTokenType());
        } catch (Exception e) {
            isValid = false;
        }
        return IntrospectResponse.builder()
                .valid(isValid)
                .build();
    }

    private String generateToken(User user, TokenType tokenType) {
        long duration = (tokenType == TokenType.ACCESS)
                ? VALID_DURATION
                : REFRESHABLE_DURATION;

        JWSHeader header = new JWSHeader(JWSAlgorithm.HS512);

        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(user.getEmail())
                .issuer("kaita")
                .issueTime(new Date())
                .expirationTime(
                        new Date(Instant.now().plus(duration, ChronoUnit.SECONDS).toEpochMilli())
                )
                .jwtID(UUID.randomUUID().toString())
                .claim("type", tokenType.name())
                .claim("userId", user.getId())
                .claim("scope", tokenType == TokenType.ACCESS ? buildScope(user) : null)
                .build();

        JWSObject jwsObject = new JWSObject(header, new Payload(claimsSet.toJSONObject()));

        try {
            jwsObject.sign(new MACSigner(SIGNER_KEY.getBytes()));
            return jwsObject.serialize();
        } catch (JOSEException e) {
            throw new RuntimeException("Cannot generate " + tokenType + " token", e);
        }
    }

    private SignedJWT verifyToken(String token, String tokenType) throws JOSEException, ParseException {
        JWSVerifier verifier = new MACVerifier(SIGNER_KEY.getBytes());

        SignedJWT signedJWT = SignedJWT.parse(token);

        boolean isRefresh = Objects.equals(tokenType, "REFRESH");
        Date expiryTime = (isRefresh)
                ? new Date(signedJWT
                .getJWTClaimsSet()
                .getIssueTime()
                .toInstant()
                .plus(REFRESHABLE_DURATION, ChronoUnit.SECONDS)
                .toEpochMilli())
                : signedJWT.getJWTClaimsSet().getExpirationTime();

        var verified = signedJWT.verify(verifier);

        if (!(verified && expiryTime.after(new Date()))) throw new AppException(ErrorCode.UNAUTHENTICATED);

        if (invalidatedTokenRepository.existsById(signedJWT.getJWTClaimsSet().getJWTID()))
            throw new AppException(ErrorCode.UNAUTHENTICATED);

        return signedJWT;
    }

    private String buildScope(User user) {
        StringJoiner stringJoiner = new StringJoiner(" ");

        if (!CollectionUtils.isEmpty(user.getRoles()))
            user.getRoles().forEach(role -> {
                stringJoiner.add("ROLE_" + role.getName());
                if (!CollectionUtils.isEmpty(role.getPermissions()))
                    role.getPermissions().forEach(permission -> stringJoiner.add("ROLE_" + permission.getName()));
            });

        return stringJoiner.toString();
    }
}
