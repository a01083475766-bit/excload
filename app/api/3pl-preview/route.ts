/**
 * EXCLOAD 3PL Preview API Route
 *
 * POST /api/3pl-preview
 * body: { templateHeaders: string[], orderData: Record<string, unknown>[], mappingData?: string[][] | null }
 *
 * 목적: run3PLPipeline을 서버에서 실행하여 UI에서 변환 로직을 직접 수행하지 않도록 한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { run3PLPipeline } from "@/app/pipeline/3pl/run-3pl-pipeline";
import { normalize3plOrderDataInput } from "@/app/pipeline/3pl/utils/normalize-3pl-order-data";

const MAX_HEADERS = 300;
const MAX_ROWS = 2000;
const MAX_JSON_BYTES = 1_000_000; // 1MB
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_WINDOW = 20;
const ipRequestWindow = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (ipRequestWindow.get(ip) || []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_PER_WINDOW) {
    ipRequestWindow.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipRequestWindow.set(ip, recent);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
      return NextResponse.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { templateHeaders, orderData, mappingData } = body ?? {};

    if (!Array.isArray(templateHeaders) || !Array.isArray(orderData)) {
      return NextResponse.json(
        { error: "요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (
      mappingData != null &&
      (!Array.isArray(mappingData) ||
        mappingData.some((row: unknown) => !Array.isArray(row)))
    ) {
      return NextResponse.json(
        { error: "mappingData는 string[][] 형식이어야 합니다." },
        { status: 400 }
      );
    }

    if (templateHeaders.length > MAX_HEADERS || orderData.length > MAX_ROWS) {
      return NextResponse.json(
        { error: "요청 데이터가 허용 크기를 초과했습니다." },
        { status: 413 }
      );
    }

    const normalizedOrderData = normalize3plOrderDataInput(
      orderData as Record<string, unknown>[],
      templateHeaders as string[]
    );

    const result = run3PLPipeline({
      templateHeaders,
      orderData: normalizedOrderData,
      mappingData: mappingData ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[3PL Preview API] 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}

