import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/cleanup";
import ProductCard from "@/components/ProductCard";

async function getProducts() {
  await releaseExpiredReservations();

  const products = await prisma.product.findMany({
    include: {
      stock: {
        include: {
          warehouse: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      warehouseLocation: s.warehouse.location,
      totalUnits: s.totalUnits,
      reservedUnits: s.reservedUnits,
      availableUnits: s.totalUnits - s.reservedUnits,
    })),
  }));
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Products</h2>
        <p className="text-gray-500 mt-1">
          Select a warehouse to reserve your item. Reservations are held for 10 minutes.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No products found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}