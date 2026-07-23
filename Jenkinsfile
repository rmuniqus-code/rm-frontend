pipeline {
  agent any

  environment {
    PROJECT_ID = 'prod-rm-project'
    REGION = 'us-central1'
    AR_REPO = 'rm-containers'
    SERVICE_NAME = 'rm-frontend'
    IMAGE_TAG = "${GIT_COMMIT.take(8)}"
    IMAGE = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/rm-frontend:${IMAGE_TAG}"
    IMAGE_LATEST = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/rm-frontend:latest"
  }

  options {
    timeout(time: 20, unit: 'MINUTES')
    disableConcurrentBuilds()
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Test') {
      steps {
        // This Jenkins node has docker/gcloud/git but no node/npm installed
        // (confirmed 23 July 2026) — run inside a Node container instead of
        // requiring Node.js on the shared host.
        // No `test` script exists in package.json yet (only dev/build/start/lint)
        // — running `lint` here instead of a nonexistent `npm test`, which
        // would just fail with "Missing script: test".
        script {
          docker.image('node:20-alpine').inside {
            // `.inside{}` runs the container as the Jenkins agent's UID (not
            // root), but node:20-alpine's default npm cache dir (/.npm) is
            // root-owned — causes EACCES (confirmed 23 July 2026). Point the
            // cache at a workspace-local dir instead, which is always
            // writable since it's the same mounted volume Jenkins owns.
            sh 'npm ci --cache "$WORKSPACE/.npm-cache" && npm run lint'
          }
        }
      }
    }

    stage('Auth GCP') {
      steps {
        // Workload Identity Federation — pool rm-jenkins-pool, provider
        // rm-jenkins-gitlab (see GCP_INFRA_SETUP.md §5.3). Replace with the
        // actual credential-config invocation once confirmed which Jenkins
        // plugin/mechanism is used for WIF on this Jenkins server.
        sh '''
          gcloud config set project ${PROJECT_ID}
          gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
        '''
      }
    }

    stage('Build image') {
      steps {
        withCredentials([
          string(credentialsId: 'rm-next-public-supabase-url', variable: 'NEXT_PUBLIC_SUPABASE_URL'),
          string(credentialsId: 'rm-next-public-supabase-anon-key', variable: 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
        ]) {
          sh '''
            docker build --platform linux/amd64 \
              --cache-from ${IMAGE_LATEST} \
              --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
              --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
              -t ${IMAGE} -t ${IMAGE_LATEST} .
          '''
        }
      }
    }

    stage('Push image') {
      steps {
        sh '''
          docker push ${IMAGE}
          docker push ${IMAGE_LATEST}
        '''
      }
    }

    stage('Deploy Cloud Run') {
      steps {
        // First-time deploy used the full flag set (service account, secrets,
        // VPC, CPU/memory/scaling) — see GCP_INFRA_SETUP.md §7.3. Subsequent
        // CI/CD deploys only need to update the image; those settings persist
        // on the service. If they ever need to change, use
        // `gcloud run services replace` against a version-controlled service
        // YAML, not by re-adding flags here.
        sh '''
          gcloud run deploy ${SERVICE_NAME} \
            --image=${IMAGE} \
            --region=${REGION} \
            --quiet
        '''
      }
    }

    stage('Post-Deploy Verify') {
      steps {
        // TODO: switch to curl -sf "$URL/healthz" once that route is
        // committed (still pending as of 23 July 2026) — for now, check
        // the root path returns a redirect/200, since /healthz 404s today
        // and would fail this stage on every run.
        sh '''
          URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')
          STATUS=$(curl -so /dev/null -w "%{http_code}" "$URL/")
          if [ "$STATUS" != "200" ] && [ "$STATUS" != "307" ]; then
            echo "Post-deploy check failed: got HTTP $STATUS from $URL/"
            exit 1
          fi
        '''
      }
    }
  }
}
