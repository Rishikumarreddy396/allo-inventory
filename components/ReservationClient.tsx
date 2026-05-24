"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/useCountdown";
import { toast } from "sonner";

type Reservation = {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  units: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  price: number;
};

export default function ReservationClient({
  reservation,
}: {
  reservation: Reservation;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(reservation.status);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const { minutes, seconds, expired } = useCountdown(reservation.expiresAt);

  const isActionable = status === "PENDING" && !expired;

  async function handleConfirm() {
    setLoading("confirm");
    try {
      const idempotencyKey = `confirm-${reservation.id}-${Date.now()}`;

      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.status === 410) {
        toast.error("Reservation expired", {
          description: "Your reservation window has passed. Please start over.",
        });
        setStatus("RELEASED");
        return;
      }

      if (!res.ok) {
        toast.error("Confirmation failed", {
          description: data.error ?? "Please try again.",
        });
        return;
      }

      setStatus("CONFIRMED");
      toast.success("Purchase confirmed!", {
        description: `Your ${reservation.productName} is on its way.`,
      });

    } catch {
      toast.error("Network error", {
        description: "Could not reach the server. Please try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("cancel");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error("Could not cancel", {
          description: data.error ?? "Please try again.",
        });
        return;
      }

      setStatus("RELEASED");
      toast.info("Reservation cancelled", {
        description: "Your hold has been released.",
      });

    } catch {
      toast.error("Network error", {
        description: "Could not reach the server. Please try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <button
          onClick={() => { router.push("/"); router.refresh(); }}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          ← Back to products
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xl">{reservation.productName}</CardTitle>
            <StatusBadge status={status} expired={expired} />
          </div>
          <p className="text-sm text-gray-500">
            From {reservation.warehouseName} · {reservation.units} unit
            {reservation.units > 1 ? "s" : ""}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Price */}
          <div className="flex justify-between items-center border-t border-b py-4">
            <span className="text-gray-600">Total</span>
            <span className="text-2xl font-bold text-gray-900">
              ₹{(reservation.price * reservation.units).toLocaleString("en-IN")}
            </span>
          </div>

          {/* Countdown */}
          {status === "PENDING" && (
            <div
              className={`rounded-lg p-4 text-center ${
                expired
                  ? "bg-red-50 border border-red-200"
                  : minutes === 0 && seconds <= 60
                  ? "bg-orange-50 border border-orange-200"
                  : "bg-blue-50 border border-blue-200"
              }`}
            >
              {expired ? (
                <p className="text-red-600 font-semibold">
                  Reservation expired
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-1">
                    Reserved for
                  </p>
                  <p
                    className={`text-4xl font-mono font-bold ${
                      minutes === 0 && seconds <= 60
                        ? "text-orange-600"
                        : "text-blue-600"
                    }`}
                  >
                    {String(minutes).padStart(2, "0")}:
                    {String(seconds).padStart(2, "0")}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Complete your purchase before time runs out
                  </p>
                </>
              )}
            </div>
          )}

          {/* Confirmed state */}
          {status === "CONFIRMED" && (
            <div className="rounded-lg p-4 text-center bg-green-50 border border-green-200">
              <p className="text-green-700 font-semibold text-lg">
                ✓ Order confirmed
              </p>
              <p className="text-green-600 text-sm mt-1">
                Your purchase was successful.
              </p>
            </div>
          )}

          {/* Released/cancelled state */}
          {status === "RELEASED" && (
            <div className="rounded-lg p-4 text-center bg-gray-50 border border-gray-200">
              <p className="text-gray-600 font-semibold">
                Reservation released
              </p>
              <p className="text-gray-400 text-sm mt-1">
                This hold has been cancelled.
              </p>
            </div>
          )}
        </CardContent>

        {/* Action buttons */}
        {isActionable && (
          <CardFooter className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={loading !== null}
            >
              {loading === "confirm" ? "Processing..." : "Confirm purchase"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
              disabled={loading !== null}
            >
              {loading === "cancel" ? "Cancelling..." : "Cancel"}
            </Button>
          </CardFooter>
        )}

        {/* Go back button after terminal state */}
        {(status === "CONFIRMED" || status === "RELEASED" || expired) && (
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { router.push("/"); router.refresh(); }}
            >
              Back to products
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({
  status,
  expired,
}: {
  status: string;
  expired: boolean;
}) {
  if (status === "CONFIRMED")
    return <Badge className="bg-green-100 text-green-700">Confirmed</Badge>;
  if (status === "RELEASED" || expired)
    return <Badge variant="destructive">Released</Badge>;
  return <Badge className="bg-blue-100 text-blue-700">Pending</Badge>;
}