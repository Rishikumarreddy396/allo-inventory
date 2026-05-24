import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/cleanup";

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await releaseExpiredReservations();

    return NextResponse.json({
      success: true,
      message: "Expired reservations released",
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}