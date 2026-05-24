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

    // --- Core reservation logic with row-level locking ---
    const reservation = await prisma.$transaction(async (tx) => {
      // Lock this specific stock row so no other request can read/write it
      // until this transaction commits. This is the race condition fix.
      const stock = await tx.$queryRaw<Array<{
        id: string;
        totalUnits: number;
        reservedUnits: number;
      }>>`
        SELECT id, "totalUnits", "reservedUnits"
        FROM "WarehouseStock"
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (stock.length === 0) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const { totalUnits, reservedUnits } = stock[0];
      const availableUnits = totalUnits - reservedUnits;

      if (availableUnits < units) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // Increment reservedUnits
      await tx.warehouseStock.update({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
        data: {
          reservedUnits: { increment: units },
        },
      });

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