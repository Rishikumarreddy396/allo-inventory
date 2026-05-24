import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- Idempotency check ---
    const idempotencyKey = request.headers.get("Idempotency-Key");

    if (idempotencyKey) {
      const cached = await getIdempotentResponse(`confirm:${idempotencyKey}`);
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
      });

      if (!reservation) {
        throw new Error("NOT_FOUND");
      }

      if (reservation.status === "CONFIRMED") {
        throw new Error("ALREADY_CONFIRMED");
      }

      if (reservation.status === "RELEASED") {
        throw new Error("ALREADY_RELEASED");
      }

      // Check expiry
      if (new Date() > new Date(reservation.expiresAt)) {
        // Auto-release
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });

        await tx.warehouseStock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reservedUnits: { decrement: reservation.units } },
        });

        throw new Error("EXPIRED");
      }

      // Confirm — permanently decrement totalUnits and clear the hold
      await tx.warehouseStock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          totalUnits: { decrement: reservation.units },
          reservedUnits: { decrement: reservation.units },
        },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = {
      id: result.id,
      productName: result.product.name,
      warehouseName: result.warehouse.name,
      units: result.units,
      status: result.status,
      expiresAt: result.expiresAt,
    };

    if (idempotencyKey) {
      await saveIdempotentResponse(`confirm:${idempotencyKey}`, 200, responseBody);
    }

    return NextResponse.json(responseBody);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Reservation not found" },
          { status: 404 }
        );
      }
      if (error.message === "EXPIRED") {
        return NextResponse.json(
          { error: "Reservation has expired" },
          { status: 410 }
        );
      }
      if (error.message === "ALREADY_CONFIRMED") {
        return NextResponse.json(
          { error: "Reservation already confirmed" },
          { status: 409 }
        );
      }
      if (error.message === "ALREADY_RELEASED") {
        return NextResponse.json(
          { error: "Reservation was already released" },
          { status: 409 }
        );
      }
    }

    console.error("POST /api/reservations/[id]/confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm reservation" },
      { status: 500 }
    );
  }
}