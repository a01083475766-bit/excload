# 기준헤더-별칭-목록.md 파일 보호 안내

## 📋 개요

`기준헤더-별칭-목록.md` 파일은 주문변환 시스템의 핵심 문서입니다.
이 파일은 **수정 및 추가는 가능하지만 삭제는 금지**됩니다.

## 🛡️ 파일 보호 방법

### 방법 1: PowerShell 스크립트 사용 (권장)

```powershell
# 보호 스크립트 실행
.\보호-기준헤더-별칭-목록.ps1
```

### 방법 2: 수동 설정

#### Windows 탐색기
1. 파일을 우클릭
2. "속성" 선택
3. "읽기 전용" 체크박스 선택
4. "확인" 클릭

#### PowerShell 명령어
```powershell
$file = Get-Item "app\pipeline\base\기준헤더-별칭-목록.md"
$file.IsReadOnly = $true
```

### 방법 3: Git 보호 (선택사항)

Git hooks를 사용하여 파일 삭제를 방지할 수 있습니다:

```bash
# .git/hooks/pre-commit 파일에 추가
if git diff --cached --name-only | grep -q "기준헤더-별칭-목록.md"; then
    echo "⚠️ 경고: 기준헤더-별칭-목록.md 파일은 삭제할 수 없습니다!"
    exit 1
fi
```

## 🔓 파일 보호 해제 방법

파일을 수정해야 할 때는 보호를 일시적으로 해제할 수 있습니다:

```powershell
$file = Get-Item "app\pipeline\base\기준헤더-별칭-목록.md"
$file.IsReadOnly = $false
```

수정 후 다시 보호를 설정하세요:

```powershell
$file.IsReadOnly = $true
```

## ⚠️ 주의사항

- 파일 삭제는 절대 금지됩니다
- 파일 이름 변경은 권장하지 않습니다
- 수정 및 추가는 자유롭게 가능합니다
- 파일이 삭제되면 `base-headers.ts`와 `alias-dictionary.ts`에서 복구 가능하지만, 정리된 문서 형태는 복구가 어렵습니다

## 📝 관련 파일

- `기준헤더-별칭-목록.md`: 이 문서 (보호 대상)
- `base-headers.ts`: 기준헤더 정의 소스
- `alias-dictionary.ts`: 별칭 사전 소스
- `보호-기준헤더-별칭-목록.ps1`: 파일 보호 스크립트
