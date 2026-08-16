# Starts Database (Docker Compose), Backend (npm dev), and Frontend (npm dev) together
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

node run-all.mjs
