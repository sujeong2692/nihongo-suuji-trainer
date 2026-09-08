# Compile and run the Nihongo Suuji Trainer (requires JDK 17+ on PATH).
# Usage: .\run.ps1 [-Port 8080] [-Jar]
param([int]$Port = 8080, [switch]$Jar)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
  Write-Error "javac not found. Install a JDK 17+ (e.g. winget install Microsoft.OpenJDK.21) and reopen the terminal."
}
$sources = (Get-ChildItem -Recurse -Path src/main/java -Filter *.java).FullName
if (Test-Path out) { Remove-Item -Recurse -Force out }
javac -encoding UTF-8 -d out $sources
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Jar) {
  jar --create --file suuji-trainer.jar --main-class suuji.Main -C out . -C src/main/resources .
  Write-Host "Built suuji-trainer.jar  ->  java -jar suuji-trainer.jar --port $Port"
  exit 0
}
java -cp "out;src/main/resources" suuji.Main --port $Port
