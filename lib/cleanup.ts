import { prisma } from "./prisma";

export async function releaseExpiredReservations() {
  const now = new Date();

  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });

  if (expired.length === 0) return;

  for (const reservation of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "RELEASED" },
      });

      await tx.warehouseStock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          reservedUnits: { decrement: reservation.units },
        },
      });
    });
  }

  console.log(`Released ${expired.length} expired reservation(s)`);
}