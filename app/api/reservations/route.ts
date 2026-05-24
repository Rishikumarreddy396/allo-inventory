import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateReservationSchema } from "@/lib/schemas";
import { getIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";

const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES) || 10;

export async function POST(request: NextRequest) {
  try {
    // --- Idempotency check ---
    const idempotencyKey = request.headers.get("Idempotency-Key");

    if (idempotencyKey) {
      const cached = await getIdempotentResponse(`reserve:${idempotencyKey}`);
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    // --- Validate request body ---
    const body = await request.json();
    const parsed = CreateReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, units } = parsed.data;

    // --- Core reservation logic with conditional update ---
    // Instead of SELECT FOR UPDATE (which has issues with Neon's PgBouncer
    // connection pooling), we use a conditional updateMany that atomically
    // checks and increments in a single statement. If two requests race,
    // only one will satisfy the WHERE condition — the other gets count 0.
    const reservation = await prisma.$transaction(async (tx) => {
      // First verify stock row exists
      const stock = await tx.warehouseStock.findFirst({
        where: { productId, warehouseId },
      });
      console.log("Stock lookup result:", JSON.stringify(stock));
      console.log("Looking for productId:", productId, "warehouseId:", warehouseId);

      if (!stock) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const availableUnits = stock.totalUnits - stock.reservedUnits;

      if (availableUnits < units) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // Atomic conditional update — only succeeds if stock is still available
      // at the moment of the UPDATE. This is the race condition fix.
      const updated = await tx.warehouseStock.updateMany({
        where: {
          productId,
          warehouseId,
          // Re-check at update time: ensures no other request sneaked in
          reservedUnits: {
            lte: stock.totalUnits - units,
          },
        },
        data: {
          reservedUnits: { increment: units },
        },
      });

      // If count is 0, another request grabbed the last unit between
      // our read and our write
      if (updated.count === 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // Create the reservation
      const expiresAt = new Date(
        Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
      );

      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          units,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey ?? null,
        },
        include: {
          product: true,
          warehouse: true,
        },
      });
    });

    const responseBody = {
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      units: reservation.units,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
    };

    // --- Save idempotent response ---
    if (idempotencyKey) {
      await saveIdempotentResponse(`reserve:${idempotencyKey}`, 201, responseBody);
    }

    return NextResponse.json(responseBody, { status: 201 });

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INSUFFICIENT_STOCK") {
        return NextResponse.json(
          { error: "Not enough stock available" },
          { status: 409 }
        );
      }
      if (error.message === "STOCK_NOT_FOUND") {
        return NextResponse.json(
          { error: "Product not found in this warehouse" },
          { status: 404 }
        );
      }
    }

    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}