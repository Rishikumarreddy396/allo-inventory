import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const result = await prisma.$transaction(async (tx) => {
      const reservations = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          units: number;
          productId: string;
          warehouseId: string;
        }>
      >`
        SELECT id, status, units, "productId", "warehouseId"
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        throw new Error("NOT_FOUND");
      }

      const reservation = reservations[0];

      if (reservation.status === "CONFIRMED") {
        throw new Error("ALREADY_CONFIRMED");
      }

      if (reservation.status === "RELEASED") {
        // Already released — return it as-is (idempotent by nature)
        return tx.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });
      }

      // Release — give units back
      await tx.warehouseStock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reservedUnits: { decrement: reservation.units } },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
        include: { product: true, warehouse: true },
      });
    }, {
      maxWait: 10000,
      timeout: 20000,
    });

    return NextResponse.json({
      id: result!.id,
      productName: result!.product.name,
      warehouseName: result!.warehouse.name,
      units: result!.units,
      status: result!.status,
      expiresAt: result!.expiresAt,
    });

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Reservation not found" },
          { status: 404 }
        );
      }
      if (error.message === "ALREADY_CONFIRMED") {
        return NextResponse.json(
          { error: "Cannot release a confirmed reservation" },
          { status: 409 }
        );
      }
    }

    console.error("POST /api/reservations/[id]/release error:", error);
    return NextResponse.json(
      { error: "Failed to release reservation" },
      { status: 500 }
    );
  }
}