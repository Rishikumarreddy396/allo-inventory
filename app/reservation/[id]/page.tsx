import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReservationClient from "@/components/ReservationClient";

async function getReservation(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true,
    },
  });

  return reservation;
}

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const reservation = await getReservation(resolvedParams.id);

  if (!reservation) notFound();

  return (
    <ReservationClient
      reservation={{
        id: reservation.id,
        productId: reservation.productId,
        productName: reservation.product.name,
        warehouseId: reservation.warehouseId,
        warehouseName: reservation.warehouse.name,
        units: reservation.units,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
        price: reservation.product.price,
      }}
    />
  );
}