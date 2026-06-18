import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isAdminEmail } from "@/app/lib/admin-auth";
import { BASE_HEADERS } from "@/app/pipeline/base/base-headers";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: "관리자 권한 필요" },
      { status: 403 }
    );
  }

  const data = [...BASE_HEADERS];

  return NextResponse.json({
    success: true,
    data,
    count: data.length,
  });
}
