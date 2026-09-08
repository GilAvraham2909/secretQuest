<#
.SYNOPSIS
    Generates an image via Cloudflare Workers AI (Flux-1-schnell) and saves it as a PNG.

.DESCRIPTION
    Reads credentials from the CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment
    variables (never hardcode them). Calls the Cloudflare Workers AI REST API and writes
    the raw image bytes returned by the API to disk as a PNG.

.PARAMETER Prompt
    Text description of the image to generate.

.PARAMETER OutFile
    Where to save the PNG. If a bare filename is given (no directory), it is saved under
    the project's generated/ folder. If a relative path is given (e.g.
    "assets/images/avatars/avatar-01.png"), it is resolved relative to the project root
    and any missing directories are created.

.EXAMPLE
    .\tools\Generate-Image.ps1 -Prompt "a friendly cartoon star mascot, warm colors, flat cute style" -OutFile "test-star.png"

.EXAMPLE
    .\tools\Generate-Image.ps1 -Prompt "..." -OutFile "assets/images/avatars/avatar-01.png"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,

    [Parameter(Mandatory = $true)]
    [string]$OutFile
)

$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
    Split-Path -Parent $PSScriptRoot
}

function Import-DotEnv {
    <#
        Minimal .env loader (no npm/dotenv available on this machine — Node isn't installed).
        Parses KEY=value lines from the project's .env file into $env: variables for this
        process only. Existing $env: values always win, matching dotenv's default behavior.
    #>
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }
        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }
        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if (-not (Test-Path "env:$key")) {
            Set-Item -Path "env:$key" -Value $value
        }
    }
}

Import-DotEnv -Path (Join-Path (Get-ProjectRoot) ".env")

function Save-GeneratedImage {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [Parameter(Mandatory = $true)][string]$OutFile
    )

    $accountId = $env:CLOUDFLARE_ACCOUNT_ID
    $apiToken = $env:CLOUDFLARE_API_TOKEN

    if (-not $accountId) {
        throw "CLOUDFLARE_ACCOUNT_ID environment variable is not set."
    }
    if (-not $apiToken) {
        throw "CLOUDFLARE_API_TOKEN environment variable is not set."
    }

    $projectRoot = Get-ProjectRoot

    if ([System.IO.Path]::IsPathRooted($OutFile)) {
        $resolvedOutFile = $OutFile
    }
    elseif ((Split-Path -Parent $OutFile)) {
        $resolvedOutFile = Join-Path $projectRoot $OutFile
    }
    else {
        $resolvedOutFile = Join-Path (Join-Path $projectRoot "generated") $OutFile
    }

    $outDir = Split-Path -Parent $resolvedOutFile
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    }

    $uri = "https://api.cloudflare.com/client/v4/accounts/$accountId/ai/run/@cf/black-forest-labs/flux-1-schnell"
    $bodyJson = @{ prompt = $Prompt } | ConvertTo-Json -Compress

    $response = Invoke-WebRequest -Uri $uri -Method Post `
        -Headers @{ Authorization = "Bearer $apiToken" } `
        -ContentType "application/json" `
        -Body $bodyJson `
        -UseBasicParsing

    $contentType = $response.Headers["Content-Type"]
    if ($contentType -match "application/json") {
        # This model's REST response wraps a base64-encoded image in JSON
        # (result.image) rather than returning raw bytes directly.
        $json = $response.Content | ConvertFrom-Json
        if (-not $json.success -or -not $json.result -or -not $json.result.image) {
            throw "Cloudflare AI API request failed: $($response.Content)"
        }
        $imageBytes = [System.Convert]::FromBase64String($json.result.image)
    }
    else {
        $imageBytes = $response.Content
    }

    [System.IO.File]::WriteAllBytes($resolvedOutFile, $imageBytes)

    return $resolvedOutFile
}

$saved = Save-GeneratedImage -Prompt $Prompt -OutFile $OutFile
Write-Host "Saved image to: $saved"
