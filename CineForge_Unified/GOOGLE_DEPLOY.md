# GitHub -> Google Cloud Run

CineForge uses GitHub as the source of truth and Google Cloud Run as the public web host.

## GitHub settings

Create these repository variables:

- GCP_PROJECT_ID
- GCP_REGION (optional)
- GCP_DATA_BUCKET — an existing Google Cloud Storage bucket for persistent CineForge projects, boundaries, generated clips and final movies

Create these repository secrets:

- GCP_WIF_PROVIDER
- GCP_SERVICE_ACCOUNT

The recommended authentication method is Workload Identity Federation instead of a long-lived service-account JSON key.

## Google Cloud Storage persistence

The deployment mounts GCP_DATA_BUCKET at /app/data using Cloud Run Cloud Storage volume support. CineForge's existing file-based project store and generated artifacts therefore persist across Cloud Run instance replacement instead of relying on ephemeral container storage.

The Cloud Run service identity needs write access to the bucket. Google currently documents Storage Object User (roles/storage.objectUser) for a service that needs to read and write mounted Cloud Storage objects.

## Deployment

The workflow .github/workflows/cineforge-google-cloud-run.yml deploys CineForge_Unified to a public Cloud Run service named cineforge.

It uses google-github-actions/deploy-cloudrun@v3, which supports source deployments and exposes the resulting service URL as a workflow output.

The workflow runs automatically when CineForge files on main change, or can be started manually from GitHub Actions.

## Generation

Cloud Run hosts the CineForge control plane and web UI. Video generation remains pluggable:

- Hugging Face Space
- remote ComfyUI
- local Wan 2.2
- external LTX-2 runtime
- external HunyuanVideo 1.5 runtime

The browser does not need to own the generation GPU.

## Public movie delivery

After all shots are complete, CineForge assembles the final MP4 and exposes it through the browser's Download final movie link at /api/projects/{project_id}/final.

## No Replit

This deployment path does not use Replit.
