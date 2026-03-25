import { NextRequest, NextResponse } from 'next/server';
import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * API route to log AI E' execution results to server log file in JSONL format
 */
export async function POST(request: NextRequest) {
  try {
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

    const logLine = JSON.stringify(logEntry) + '\n';

    // Append to server log file
    // Log file location: logs/ai-execution.log (relative to project root)
    const logFilePath = join(process.cwd(), 'logs', 'ai-execution.log');
    
    // Ensure logs directory exists (create if it doesn't)
    try {
      mkdirSync(dirname(logFilePath), { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }

    // Append log entry
    appendFileSync(logFilePath, logLine, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[log-ai-execution] Error:', error);
    return NextResponse.json(
      { error: 'Failed to write log' },
      { status: 500 }
    );
  }
}

