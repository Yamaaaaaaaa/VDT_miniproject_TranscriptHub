pipeline {
    agent any

    environment {
        // Cấu hình ID credentials lưu trên Jenkins
        DOCKER_CREDS_ID   = 'dockerhub-credentials'
        SSH_CREDS_ID      = 'vps-ssh-key'
        
        // Cấu hình thông tin Docker Registry & VPS
        DOCKER_REGISTRY   = 'docker.io'
        DOCKER_USER       = 'yourusername' // Thay thế bằng Docker Hub username của bạn
        VPS_HOST          = '192.168.1.100' // Thay thế bằng IP VPS của bạn
        VPS_USER          = 'ubuntu'       // Thay thế bằng SSH User của bạn
        DEPLOY_PATH       = '/app/VDT_miniproject_TranscriptHub'
        
        // Tags cho Docker images
        IMAGE_TAG         = "${env.BUILD_NUMBER}"
        LATEST_TAG        = "latest"

        // Cấu hình Biến môi trường chạy Test (thay thế cho file .env không push lên Git)
        DATABASE_URL      = 'postgresql://postgres:postgres@postgres:5432/transcripthub'
        REDIS_HOST        = 'redis'
        REDIS_PORT        = '6379'
        JWT_SECRET        = 'th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN'
        JWT_REFRESH_SECRET = 'th_refresh_s3cr3t_k3y_p2mX8nL4qK9vR6bW1zY5cE0aF7gH3jN'
    }

    options {
        timeout(time: 1, unit: 'HOURS') // Hủy pipeline nếu chạy quá 1 tiếng
        buildDiscarder(logRotator(numToKeepStr: '10')) // Chỉ giữ lại log của 10 lần build gần nhất
        disableConcurrentBuilds() // Không cho phép chạy song song nhiều build của cùng nhánh
    }

    stages {
        // ── STAGE 1: KHỞI TẠO & KIỂM TRA MÔ TRƯỜNG ───────────────────
        stage('Prepare & Verify') {
            steps {
                echo 'Checking Environment Tools...'
                sh 'node --version'
                sh 'npm --version'
                sh 'docker --version'
            }
        }

        // ── STAGE 2: TÍCH HỢP LIÊN TỤC (CI) - LINT & TEST ────────────
        stage('Lint & Unit Test') {
            parallel {
                stage('Test Backend (NestJS)') {
                    steps {
                        dir('services_ms') {
                            echo 'Installing Backend dependencies...'
                            sh 'npm ci'
                            echo 'Generating Prisma Client...'
                            sh 'npx prisma generate'
                            echo 'Running Backend Linter...'
                            sh 'npm run lint'
                            echo 'Running Backend Tests...'
                            sh 'npm run test -- --passWithNoTests'
                            echo 'Running Backend E2E Tests...'
                            sh 'npm run test:e2e -- --passWithNoTests'
                        }
                    }
                }
                stage('Test Frontend (Next.js)') {
                    steps {
                        dir('fe_next') {
                            echo 'Installing Frontend dependencies...'
                            sh 'npm ci'
                            echo 'Building Frontend to verify compile status...'
                            sh 'npm run build'
                        }
                    }
                }
            }
            post {
                always {
                    echo 'Publishing JUnit Test Reports...'
                    junit 'services_ms/test-reports/*.xml'
                }
            }
        }

        // ── STAGE 3: BUILD & PUSH DOCKER IMAGES (PARALLEL) ───────────
        stage('Docker Build & Push') {
            steps {
                script {
                    // Đăng nhập Docker Hub bằng Jenkins Credentials (Tạm tắt khi test local)
                    /* withCredentials([usernamePassword(credentialsId: env.DOCKER_CREDS_ID, 
                                                      usernameVariable: 'DOCKER_USER_VAR', 
                                                      passwordVariable: 'DOCKER_PASS_VAR')]) {
                        sh "echo \$DOCKER_PASS_VAR | docker login -u \$DOCKER_USER_VAR --password-stdin ${env.DOCKER_REGISTRY}"
                    } */

                    // Chạy song song build các Docker Images để giảm tối đa thời gian pipeline
                    parallel(
                        "api-gateway": {
                            echo "Building API Gateway..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-api-gateway:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-api-gateway:${env.LATEST_TAG} -f services_ms/apps/api-gateway/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-api-gateway:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-api-gateway:${env.LATEST_TAG}"
                        },
                        "users-service": {
                            echo "Building Users Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-users:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-users:${env.LATEST_TAG} -f services_ms/apps/users/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-users:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-users:${env.LATEST_TAG}"
                        },
                        "identity-service": {
                            echo "Building Identity Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-identity:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-identity:${env.LATEST_TAG} -f services_ms/apps/identity/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-identity:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-identity:${env.LATEST_TAG}"
                        },
                        "file-service": {
                            echo "Building File Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-file:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-file:${env.LATEST_TAG} -f services_ms/apps/file/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-file:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-file:${env.LATEST_TAG}"
                        },
                        "transcript-service": {
                            echo "Building Transcript Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-transcript:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-transcript:${env.LATEST_TAG} -f services_ms/apps/transcript/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-transcript:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-transcript:${env.LATEST_TAG}"
                        },
                        "meeting-service": {
                            echo "Building Meeting Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-meeting:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-meeting:${env.LATEST_TAG} -f services_ms/apps/meeting/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-meeting:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-meeting:${env.LATEST_TAG}"
                        },
                        "collab-service": {
                            echo "Building Collab Service..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-collab:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-collab:${env.LATEST_TAG} -f services_ms/apps/collab/Dockerfile --target production services_ms"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-collab:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-collab:${env.LATEST_TAG}"
                        },
                        "collab-gateway": {
                            echo "Building Collab Gateway..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-collab-gateway:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-collab-gateway:${env.LATEST_TAG} -f services_ms/apps/collab-gateway/Dockerfile services_ms/apps/collab-gateway"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-collab-gateway:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-collab-gateway:${env.LATEST_TAG}"
                        },
                        "frontend": {
                            echo "Building Frontend Next.js..."
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-frontend:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-frontend:${env.LATEST_TAG} -f fe_next/Dockerfile fe_next"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-frontend:${env.IMAGE_TAG}"
                            // sh "docker push ${env.DOCKER_USER}/transcripthub-frontend:${env.LATEST_TAG}"
                        }
                    )
                }
            }
        }

        // ── STAGE 4: TRIỂN KHAI LIÊN TỤC (CD) (Tạm tắt khi test local) ────────────────────────
        /* stage('Deploy to VPS') {
            steps {
                script {
                    // Sử dụng plugin sshagent để nạp SSH private key và kết nối bảo mật tới VPS
                    sshagent(credentials: [env.SSH_CREDS_ID]) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${env.VPS_USER}@${env.VPS_HOST} "
                                cd ${env.DEPLOY_PATH}
                                echo 'Connected to VPS. Pulling new Docker Images...'
                                docker compose pull
                                echo 'Updating stack without downtime...'
                                docker compose up -d --remove-orphans
                                echo 'Cleaning old Docker images...'
                                docker image prune -f
                                echo 'Deployment Completed successfully!'
                            "
                        """
                    }
                }
            }
        } */
    }

    // ── GIAI ĐOẠN PHẢN HỒI (NOTIFICATIONS) ──────────────────────────
    post {
        always {
            // Thực hiện dọn dẹp các images tạm trên Jenkins Runner/Node sau khi build xong để tránh đầy ổ cứng
            echo 'Cleaning local images on Jenkins Runner...'
            sh "docker rmi \$(docker images | grep '${env.DOCKER_USER}/transcripthub' | awk '{print \$3}') -f || true"
        }
        success {
            echo "Pipeline succeeded! Build #${env.BUILD_NUMBER} deployed successfully."
            // Có thể tích hợp thông báo Slack/Discord tại đây:
            // slackSend channel: '#ci-cd-alerts', color: 'good', message: "SUCCESSFUL: Job '${env.JOB_NAME}' [Build #${env.BUILD_NUMBER}] (${env.BUILD_URL})"
        }
        failure {
            echo "Pipeline failed! Please check console logs."
            // slackSend channel: '#ci-cd-alerts', color: 'danger', message: "FAILED: Job '${env.JOB_NAME}' [Build #${env.BUILD_NUMBER}] (${env.BUILD_URL})"
        }
    }
}
