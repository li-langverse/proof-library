# Push GitLab primary main -> GitHub li-langverse/proof-library (Pages host).
# GitHub remote is fetch-only locally; this uses org PAT from k8s secret or GH_MIRROR_TOKEN.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$SecretNamespace = "li-swarm",
    [string]$SecretName = "gitlab-github-mirror-secrets",
    [switch]$SkipWorkflow
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Push-Location $Root
try {
    git checkout main | Out-Null
    git pull origin main

    $token = $env:GH_MIRROR_TOKEN
    if (-not $token) { $token = $env:GITHUB_OFFICIAL_TOKEN }
    if (-not $token -and (Test-Path $KubeConfig)) {
        $env:KUBECONFIG = $KubeConfig
        $b64 = kubectl -n $SecretNamespace get secret $SecretName `
            -o jsonpath='{.data.GITHUB_OFFICIAL_TOKEN}' 2>$null
        if ($b64) {
            $token = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
        }
    }
    if (-not $token) {
        throw "Set GH_MIRROR_TOKEN or ensure k8s secret $SecretNamespace/$SecretName has GITHUB_OFFICIAL_TOKEN"
    }

    $url = "https://x-access-token:${token}@github.com/li-langverse/proof-library.git"
    git push $url main
    git remote set-url --push github DISABLED 2>$null

    if (-not $SkipWorkflow) {
        gh workflow run "Deploy proof library site" --ref main
        Write-Host "Triggered GitHub Pages deploy workflow"
    }
    Write-Host "OK: GitLab main synced to github.com/li-langverse/proof-library main"
} finally {
    Pop-Location
}
