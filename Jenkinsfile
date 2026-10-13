pipeline {
    agent any
 
    environment {
        APP_NAME = 'app-hello-nti' 
        REPO_URL = "https://github.com/MohamedMagdy840/jenkins-repo.git"
    }

    stages {
        stage('Getting Repo files') {
            steps {
                git branch: "main", credentialsId: 'jenkins-token', url: "${REPO_URL}"
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    sh """
                        docker build -t ${APP_NAME}:${BUILD_NUMBER} .
                    """
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: 'docker', usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {

                        sh """
                            echo ${DOCKER_PASSWORD} | docker login -u ${DOCKER_USERNAME} --password-stdin

                            docker tag ${APP_NAME}:${BUILD_NUMBER} ${DOCKER_USERNAME}/${APP_NAME}:${BUILD_NUMBER}

                            docker push ${DOCKER_USERNAME}/${APP_NAME}:${BUILD_NUMBER}
                        """

                    }
                }
            }
        }

      stage('Run Docker Container') {
    steps {
        script {
            sh '''
                CONTAINER_NAME="app-hello-nti-main-7"

                # Remove the old container if it exists
                docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

                # Run the new container
                docker run -d \
                    --name "$CONTAINER_NAME" \
                    -p 5001:5000 \
                    app-hello-nti:7

                # Show running containers
                docker ps
            '''
        }
    }
}

    }
}
