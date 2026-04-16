# 파이프라인 검증 및 에러 처리 시스템

## 개요

이 시스템은 EXCLOAD 파이프라인에서 발생할 수 있는 데이터 일관성 오류와 매핑 오류를 미연에 방지하고, 발생 시 사용자에게 친화적인 메시지를 제공합니다.

## 주요 기능

### 1. 데이터 검증 (`validation.ts`)

각 파이프라인 단계에서 데이터의 타입과 일관성을 검증합니다.

#### 검증 함수들

- `validateCleanInputFile()`: Stage0 출력 검증
- `validateTemplateBridgeFile()`: Stage1 출력 검증
- `validateOrderStandardFile()`: Stage2 출력 검증
- `validateFixedInput()`: 고정 입력값 검증
- `validatePreviewRow()`: Stage3 출력 검증
- `validateMergeInputs()`: Stage3 입력 통합 검증
- `validateHeaderMapping()`: 헤더 매핑 일관성 검증
- `validateMappingConsistency()`: 데이터 매핑 일관성 검증

#### 사용 예시

```typescript
import { validateTemplateBridgeFile, logValidationResult, throwIfInvalid } from '../utils/validation';

const bridgeFile: TemplateBridgeFile = { /* ... */ };
const validationResult = validateTemplateBridgeFile(bridgeFile);
logValidationResult(validationResult, 'Stage1');
throwIfInvalid(validationResult, 'Stage1');
```

### 2. 에러 처리 (`error-handler.ts`)

에러를 사용자 친화적인 형태로 변환하고 복구 가이드를 제공합니다.

#### 주요 함수들

- `toUserFriendlyError()`: 에러를 사용자 친화적 형태로 변환
- `handlePipelineError()`: 에러를 안전하게 처리
- `logError()`: 에러를 콘솔에 출력

#### 사용 예시

```typescript
import { handlePipelineError, logError } from '../utils/error-handler';

try {
  // 파이프라인 실행
} catch (error) {
  const userError = handlePipelineError(error, 'Stage1');
  logError(userError);
  // UI에 userError.message와 userError.recoverySteps 표시
}
```

## 검증 체크포인트

각 파이프라인 단계에 다음 검증이 자동으로 수행됩니다:

### Stage1 (Template Pipeline)
- ✅ TemplateBridgeFile 구조 검증
- ✅ courierHeaders와 mappedBaseHeaders 길이 일치 검증
- ✅ 헤더 매핑 일관성 검증

### Stage2 (Order Pipeline)
- ✅ CleanInputFile 입력 검증
- ✅ OrderStandardFile 출력 검증
- ✅ rows의 각 행이 baseHeaders를 포함하는지 검증
- ✅ `개인통관번호` 값 형식 검증 (`P + 숫자 12자리`, 빈 값 허용)

### Stage3 (Merge Pipeline)
- ✅ 입력 통합 검증 (bridgeFile + orderFile + fixedInput)
- ✅ PreviewRow 검증 (첫 번째 행)
- ✅ courierHeaders와 previewRow 키 일치 검증

## 에러 카테고리

- `VALIDATION_ERROR`: 데이터 검증 실패
- `MAPPING_ERROR`: 데이터 매핑 오류
- `DATA_INCONSISTENCY`: 데이터 일관성 오류
- `TYPE_ERROR`: 타입 오류
- `UNKNOWN_ERROR`: 알 수 없는 오류

## 복구 가이드

각 검증 함수는 실패 시 자동으로 복구 가이드를 제공합니다:

1. 입력 데이터 확인
2. 파이프라인 단계 확인
3. 매핑 설정 확인
4. 데이터 소스 확인

## 주의사항

⚠️ **검증은 개발 환경에서만 상세 로그를 출력합니다.**
⚠️ **프로덕션 환경에서는 에러만 기록하고 사용자에게는 친화적인 메시지만 표시합니다.**

## 헌법 준수

이 시스템은 CONSTITUTION.md v4.1을 준수하며:
- ✅ 파이프라인 구조 유지
- ✅ 단계 간 독립성 보장
- ✅ 기준헤더 규칙 준수
- ✅ 에러 발생 시 명확한 가이드 제공
