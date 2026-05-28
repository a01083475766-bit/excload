import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

/**
 * API route to log AI E' execution results to server log file in JSONL format
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logData = await request.json();
    
    // Validate required fields
    if (
      typeof logData.status !== 'string' ||
      typeof logData.remainingTextLength !== 'number' ||
      typeof logData.hasUserRetry !== 'boolean' ||
      typeof logData.timestamp !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid log data format' },
        { status: 400 }
      );
    }

    // Create log entry in JSONL format
    const logEntry = {
      status: logData.status,
      errorType: logData.errorType || null,
      remainingTextLength: logData.remainingTextLength,
      hasUserRetry: logData.hasUserRetry,
      timestamp: logData.timestamp,
    };

    // 운영 최소 로그: 상태 요약만 남기고 파일 저장은 하지 않는다.
    console.info('[AI Execution]', logEntry);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[log-ai-execution] Error:', error);
    return NextResponse.json(
      { error: 'Failed to write log' },
      { status: 500 }
    );
  }
}

