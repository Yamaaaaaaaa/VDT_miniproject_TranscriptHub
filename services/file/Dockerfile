# Stage 1: Build the application
FROM gradle:8.7-jdk17-alpine AS build
COPY --chown=gradle:gradle . /home/gradle/src
WORKDIR /home/gradle/src
RUN gradle build -x test --no-daemon

# Stage 2: Run the application
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /home/gradle/src/build/libs/*.jar /app/
EXPOSE 8083
ENTRYPOINT ["sh", "-c", "java -jar $(ls /app/*.jar | grep -v plain)"]
