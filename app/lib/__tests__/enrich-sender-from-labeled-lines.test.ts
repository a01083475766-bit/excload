import { describe, it, expect } from 'vitest';
import {
  extractSenderFromLabeledLines,
  parseSenderLineContent,
  enrichOrdersWithLabeledSender,
} from '@/app/lib/normalize-29/enrich-sender-from-labeled-lines';

const USER_CASE_TEXT = `김영수 010-2222-3333 서울 강남구 테헤란로 123 2층 사시미 2팩
보내는사람 홍길동 인천시 미추홀구 용인아파트 903호 010-1234-5766`;

describe('extractSenderFromLabeledLines', () => {
  it('전화가 줄 끝인 보내는사람 줄 — 이름·주소·전화 분리', () => {
    const sender = extractSenderFromLabeledLines(USER_CASE_TEXT);
    expect(sender).toEqual({
      보내는사람: '홍길동',
      보내는사람전화1: '010-1234-5766',
      보내는사람주소1: '인천시 미추홀구 용인아파트 903호',
    });
  });

  it('콜론 있는 보내는사람: 이름 전화', () => {
    const sender = extractSenderFromLabeledLines('보내는사람: 김판매 010-9999-8888');
    expect(sender).toEqual({
      보내는사람: '김판매',
      보내는사람전화1: '010-9999-8888',
      보내는사람주소1: '',
    });
  });

  it('보내는사람 라벨 줄 없으면 null', () => {
    expect(extractSenderFromLabeledLines('김영수 010-1111 서울시 강남구')).toBeNull();
  });
});

describe('parseSenderLineContent', () => {
  it('이름 뒤 주소, 전화 맨 끝', () => {
    expect(
      parseSenderLineContent('홍길동 인천시 미추홀구 용인아파트 903호 010-1234-5766'),
    ).toEqual({
      보내는사람: '홍길동',
      보내는사람전화1: '010-1234-5766',
      보내는사람주소1: '인천시 미추홀구 용인아파트 903호',
    });
  });
});

describe('enrichOrdersWithLabeledSender', () => {
  it('비어 있는 보내는사람 필드만 채움', () => {
    const orders = enrichOrdersWithLabeledSender(
      [
        {
          받는사람: '김영수',
          받는사람전화1: '010-2222-3333',
          보내는사람: '',
          보내는사람전화1: '',
          보내는사람주소1: '',
        },
      ],
      USER_CASE_TEXT,
    );
    expect(orders[0]?.보내는사람).toBe('홍길동');
    expect(orders[0]?.보내는사람전화1).toBe('010-1234-5766');
    expect(orders[0]?.보내는사람주소1).toBe('인천시 미추홀구 용인아파트 903호');
  });

  it('AI가 이미 채운 보내는사람은 덮어쓰지 않음', () => {
    const orders = enrichOrdersWithLabeledSender(
      [
        {
          보내는사람: '기존발송인',
          보내는사람전화1: '010-0000-0000',
          보내는사람주소1: '기존주소',
        },
      ],
      USER_CASE_TEXT,
    );
    expect(orders[0]?.보내는사람).toBe('기존발송인');
    expect(orders[0]?.보내는사람전화1).toBe('010-0000-0000');
    expect(orders[0]?.보내는사람주소1).toBe('기존주소');
  });

  it('다건 orders에 동일 보내는사람 블록 적용', () => {
    const orders = enrichOrdersWithLabeledSender(
      [
        { 받는사람: '김영수', 보내는사람: '' },
        { 받는사람: '박민지', 보내는사람: '' },
      ],
      `김영수 …\n박민지 …\n보내는사람 홍길동 010-1111-2222`,
    );
    expect(orders[0]?.보내는사람).toBe('홍길동');
    expect(orders[1]?.보내는사람).toBe('홍길동');
  });
});
