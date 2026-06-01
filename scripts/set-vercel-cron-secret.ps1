# CRON_SECRET 생성 후 Vercel Production에만 등록 (값은 콘솔에 출력하지 않음)
# 사전: npx vercel login  및  npx vercel link (프로젝트 excload)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$null = npx vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Vercel 로그인이 필요합니다. 먼저 실행하세요: npx vercel login'
  exit 1
}

$secret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
$secret | npx vercel env add CRON_SECRET production --force --sensitive
if ($LASTEXITCODE -ne 0) {
  Write-Host '등록 실패. 프로젝트 연결: npx vercel link'
  exit 1
}

Write-Host 'CRON_SECRET 이(가) Vercel Production에 등록되었습니다. (값은 표시하지 않음)'
Write-Host '다음: Vercel 대시보드에서 확인 후 Production Redeploy 하세요.'
