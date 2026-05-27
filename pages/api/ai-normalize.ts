import type { NextApiRequest, NextApiResponse } from 'next';

type DeprecatedResponse = {
  status: 'ERROR';
  error: string;
};

/**
 * Legacy endpoint intentionally disabled.
 * Use /api/ai-gateway instead.
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeprecatedResponse>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: 'ERROR',
      error: 'Method Not Allowed',
    });
  }

  return res.status(410).json({
    status: 'ERROR',
    error: 'Deprecated endpoint. Use /api/ai-gateway.',
  });
}
