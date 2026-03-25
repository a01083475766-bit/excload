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

export async function POST(request: NextRequest) {
  try {
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

