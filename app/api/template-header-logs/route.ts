/**
 * POST /api/template-header-logs
 * 업로드 양식 등록 시 엑셀 1행 헤더만 저장 (주문·PII 미저장)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import {
  isTemplateHeaderLogPage,
  isTemplateHeaderLogSource,
  sanitizeHeaderArray,
  sanitizeHeaderArrayForLayout,
  sanitizeHeaderLabel,
  countNonEmptyLayoutHeaders,
  TEMPLATE_HEADER_LOG_MAX_HEADERS,
  type TemplateHeaderLogMappedEntry,
} from '@/app/lib/template-header-log';
import { syncHeadersToDictionary } from '@/app/lib/header-dictionary-sync';
import { logPrismaError } from '@/app/lib/log-prisma-error';

function parseMappedHeaders(raw: unknown): TemplateHeaderLogMappedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateHeaderLogMappedEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const header = sanitizeHeaderLabel((item as { header?: unknown }).header);
    if (!header) continue;
    const baseRaw = (item as { baseHeader?: unknown }).baseHeader;
    const baseHeader =
      baseRaw != null && String(baseRaw).trim() !== ''
        ? sanitizeHeaderLabel(baseRaw)
        : null;
    out.push({ header, baseHeader });
    if (out.length >= TEMPLATE_HEADER_LOG_MAX_HEADERS) break;
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const page = typeof body?.page === 'string' ? body.page.trim() : '';
    if (!isTemplateHeaderLogPage(page)) {
      return NextResponse.json({ error: 'page 값이 올바르지 않습니다.' }, { status: 400 });
    }

    const layoutHeaders = sanitizeHeaderArrayForLayout(body?.headers);
    const statsHeaders = sanitizeHeaderArray(body?.headers);
    if (layoutHeaders.length === 0 || statsHeaders.length === 0) {
      return NextResponse.json({ error: 'headers가 비어 있습니다.' }, { status: 400 });
    }

    const mappedHeaders = parseMappedHeaders(body?.mappedHeaders);
    const unknownHeaders = sanitizeHeaderArray(body?.unknownHeaders);

    const headerCount =
      typeof body?.headerCount === 'number' && Number.isFinite(body.headerCount)
        ? Math.min(Math.max(0, Math.floor(body.headerCount)), TEMPLATE_HEADER_LOG_MAX_HEADERS)
        : countNonEmptyLayoutHeaders(layoutHeaders);

    const fileSessionId =
      typeof body?.fileSessionId === 'string' && body.fileSessionId.trim()
        ? body.fileSessionId.trim().slice(0, 64)
        : null;
    const templateId =
      typeof body?.templateId === 'string' && body.templateId.trim()
        ? body.templateId.trim().slice(0, 64)
        : null;
    const templateName =
      typeof body?.templateName === 'string' && body.templateName.trim()
        ? sanitizeHeaderLabel(body.templateName)
        : null;
    const courierName =
      typeof body?.courierName === 'string' && body.courierName.trim()
        ? sanitizeHeaderLabel(body.courierName)
        : null;

    const sourceRaw = typeof body?.source === 'string' ? body.source.trim() : 'template_upload';
    const source = isTemplateHeaderLogSource(sourceRaw) ? sourceRaw : 'template_upload';

    const mappingSuccessRateRaw = body?.mappingSuccessRate;
    const mappingSuccessRate =
      typeof mappingSuccessRateRaw === 'number' && Number.isFinite(mappingSuccessRateRaw)
        ? Math.min(Math.max(mappingSuccessRateRaw, 0), 1)
        : null;

    const userId =
      session?.user?.id && String(session.user.id).trim()
        ? String(session.user.id)
        : null;

    const row = await prisma.templateHeaderLog.create({
      data: {
        userId,
        fileSessionId,
        templateId,
        page,
        templateName,
        courierName,
        headers: layoutHeaders,
        mappedHeaders,
        unknownHeaders,
        headerCount,
        mappingSuccessRate,
        source,
      },
    });

    try {
      const syncResult = await syncHeadersToDictionary({
        headers: statsHeaders,
        mappedHeaders,
        page,
        source,
      });
      if (syncResult.newHeaders.length > 0) {
        console.info('[template-header-logs] HeaderDictionary sync ok', {
          logId: row.id,
          newHeaderCount: syncResult.newHeaders.length,
        });
      }
    } catch (syncError) {
      logPrismaError('HeaderDictionary sync error', syncError);
    }

    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error('[template-header-logs] POST error:', error);
    return NextResponse.json(
      { error: '헤더 로그 저장 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
