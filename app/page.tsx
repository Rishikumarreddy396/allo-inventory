import ProductCard from "@/components/ProductCard";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: StockEntry[];
};

async function getProducts(): Promise<Product[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/products`,
    { cache: "no-store" }
  );

  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
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