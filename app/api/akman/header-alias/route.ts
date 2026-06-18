/**
 * EXCLOAD 관리자 API - Header Alias 저장
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안 규칙:
 * 1. 로그인된 사용자만 접근 가능
 * 2. session.user.email === process.env.ADMIN_EMAIL 인 경우만 접근 허용
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { clearHeaderAliasDictionaryCache } from "@/app/lib/header-alias-cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isAdminEmail } from "@/app/lib/admin-auth";
import { BASE_HEADERS } from "@/app/pipeline/base/base-headers";

const BASE_HEADER_SET = new Set<string>([...BASE_HEADERS]);

function sanitizeRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: "관리자 권한 필요" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const alias = sanitizeRequiredString(body?.alias);
    const baseHeader = sanitizeRequiredString(body?.baseHeader);

    // 입력 검증
    if (!alias || !baseHeader) {
      return NextResponse.json(
        { error: "alias와 baseHeader는 필수입니다." },
        { status: 400 }
      );
    }

    if (!BASE_HEADER_SET.has(baseHeader)) {
      return NextResponse.json(
        { error: "baseHeader가 기준헤더 목록에 없습니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.headerAlias.findUnique({
      where: { alias },
    });

    if (existing) {
      if (existing.baseHeader === baseHeader) {
        clearHeaderAliasDictionaryCache();
        return NextResponse.json({
          success: true,
          alreadyExists: true,
          data: existing,
        });
      }

      return NextResponse.json(
        {
          error: "이미 다른 기준헤더로 등록된 alias입니다.",
          conflict: {
            alias,
            existingBaseHeader: existing.baseHeader,
            requestedBaseHeader: baseHeader,
          },
        },
        { status: 409 }
      );
    }

    // HeaderAlias 신규 저장. 기존 alias의 baseHeader 자동 덮어쓰기는 금지한다.
    const headerAlias = await prisma.headerAlias.create({
      data: {
        alias: alias,
        baseHeader: baseHeader,
        source: "admin",
      },
    });

    clearHeaderAliasDictionaryCache();

    return NextResponse.json({
      success: true,
      data: headerAlias,
    });
  } catch (error: any) {
    console.error("[Header Alias API] 저장 실패:", error);
    
    // 중복 에러 처리
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 존재하는 alias입니다." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Alias 저장 실패: " + (error.message || "알 수 없는 오류") },
      { status: 500 }
    );
  }
}

// GET: HeaderAlias 목록 조회 (관리자용)
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: "관리자 권한 필요" },
        { status: 403 }
      );
    }

    // 쿼리 파라미터에서 alias 검색 (선택사항)
    const { searchParams } = new URL(request.url);
    const searchAlias = searchParams.get("alias");

    let aliases;
    if (searchAlias) {
      // 특정 alias 검색
      aliases = await prisma.headerAlias.findMany({
        where: {
          alias: {
            contains: searchAlias,
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // 전체 목록 조회
      aliases = await prisma.headerAlias.findMany({
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({
      success: true,
      data: aliases,
      count: aliases.length,
    });
  } catch (error: any) {
    console.error("[Header Alias API] 조회 실패:", error);
    return NextResponse.json(
      { error: "Alias 조회 실패: " + (error.message || "알 수 없는 오류") },
      { status: 500 }
    );
  }
}
