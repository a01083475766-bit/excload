# 기준헤더-별칭-목록.md 파일 보호 스크립트
# 이 스크립트는 기준헤더-별칭-목록.md 파일을 읽기 전용으로 설정합니다.

$filePath = Join-Path $PSScriptRoot "기준헤더-별칭-목록.md"

if (Test-Path $filePath) {
    try {
        $file = Get-Item $filePath
        $file.IsReadOnly = $true
        Write-Host "✅ 파일이 읽기 전용으로 설정되었습니다: $($file.FullName)" -ForegroundColor Green
        Write-Host "   파일 속성: 읽기 전용 = $($file.IsReadOnly)" -ForegroundColor Yellow
    }
    catch {
        Write-Host "❌ 파일 속성 설정 중 오류 발생: $_" -ForegroundColor Red
    }
}
else {
    Write-Host "❌ 파일을 찾을 수 없습니다: $filePath" -ForegroundColor Red
}

Write-Host "`n💡 파일 보호 해제 방법:" -ForegroundColor Cyan
Write-Host "   PowerShell: `$file = Get-Item '$filePath'; `$file.IsReadOnly = `$false" -ForegroundColor Gray
