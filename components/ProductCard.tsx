"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

export default function ProductCard({ product }: { product: Product }) {
  const router = useRouter();

  const [loadingWarehouse, setLoadingWarehouse] = useState<string | null>(null);

  async function handleReserve(warehouseId: string) {
    setLoadingWarehouse(warehouseId);

    try {
      const idempotencyKey = `${product.id}-${warehouseId}-${Date.now()}`;

      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          units: 1,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error("Out of stock", {
          description: "Sorry, no units available in this warehouse.",
        });
        return;
      }

      if (!res.ok) {
        toast.error("Something went wrong", {
          description: data.error ?? "Please try again.",
        });
        return;
      }

      // Redirect to reservation page
      router.push(`/reservation/${data.id}`);

    } catch {
      toast.error("Network error", {
        description: "Could not reach the server. Please try again.",
      });
    } finally {
      setLoadingWarehouse(null);
    }
  }

  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{product.name}</CardTitle>
          <span className="text-lg font-bold text-blue-600 whitespace-nowrap">
            ₹{product.price.toLocaleString("en-IN")}
          </span>
        </div>
        <p className="text-sm text-gray-500">{product.description}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Stock by warehouse
        </p>
        {product.stock.map((s) => (
          <div
            key={s.warehouseId}
            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{s.warehouseName}</p>
              <p className="text-xs text-gray-400">{s.warehouseLocation}</p>
            </div>
            <div className="flex items-center gap-2">
              {s.availableUnits === 0 ? (
                <Badge variant="destructive">Out of stock</Badge>
              ) : s.availableUnits <= 2 ? (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                  Only {s.availableUnits} left
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  {s.availableUnits} available
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 pt-2">
        {product.stock.map((s) => (
          <Button
            key={s.warehouseId}
            className="w-full"
            disabled={s.availableUnits === 0 || loadingWarehouse === s.warehouseId}
            onClick={() => handleReserve(s.warehouseId)}
            variant={s.availableUnits === 0 ? "secondary" : "default"}
          >
            {loadingWarehouse === s.warehouseId
              ? "Reserving..."
              : s.availableUnits === 0
              ? `${s.warehouseName} — Unavailable`
              : `Reserve from ${s.warehouseName}`}
          </Button>
        ))}
      </CardFooter>
    </Card>
  );
}