# GitHub -> Google Cloud Run

CineForge uses GitHub as the source of truth and Google Cloud Run as the public web host.

## GitHub settings

Create this repository variable:

- GCP_PROJECT_ID
- GCP_REGION (optional)

Create these repository secrets:

- GCP_WIF_PROVIDER
- GCP_SERVICE_ACCOUNT

The recommended authentication method is Workload Identity Federation instead of a long-lived service-account JSON key.

The workflow .github/workflows/cineforge-google-cloud-run.yml deploys CineForge_Unified to a public Cloud Run service named cineforge.

## Google permissions

The GitHub deployment identity must have the permissions required to build and deploy Cloud Run from source. Google documents the required roles for source deployment.

## Persistence

The current app stores project state under data/projects. Container-local storage is not durable on Cloud Run. For production movie projects, move project metadata and generated artifacts to durable Google storage or a database.

## Generation

Cloud Run hosts the CineForge control plane and UI. Video generation can remain remote through Hugging Face Spaces or ComfyUI, or use a compatible external model runtime. The browser therefore does not need a GPU.

## Deployment

Once the GitHub secrets and variable are configured, the workflow deploys automatically on changes to CineForge_Unified or can be started manually from GitHub Actions.

No Replit is used.
