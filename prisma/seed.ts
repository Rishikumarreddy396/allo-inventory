import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.reservation.deleteMany();
  await prisma.warehouseStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const mumbai = await prisma.warehouse.create({
    data: {
      name: "Mumbai Central",
      location: "Mumbai, Maharashtra",
    },
  });

  const delhi = await prisma.warehouse.create({
    data: {
      name: "Delhi North",
      location: "Delhi, NCR",
    },
  });

  // Create products
  const headphones = await prisma.product.create({
    data: {
      name: "Wireless Headphones",
      description: "Premium noise-cancelling over-ear headphones",
      price: 4999,
    },
  });

  const keyboard = await prisma.product.create({
    data: {
      name: "Mechanical Keyboard",
      description: "Compact TKL keyboard with tactile switches",
      price: 3499,
    },
  });

  const hub = await prisma.product.create({
    data: {
      name: "USB-C Hub",
      description: "7-in-1 USB-C hub with HDMI and PD charging",
      price: 1999,
    },
  });

  // Create stock levels
  // Headphones — decent stock in both
  await prisma.warehouseStock.createMany({
    data: [
      { productId: headphones.id, warehouseId: mumbai.id, totalUnits: 10 },
      { productId: headphones.id, warehouseId: delhi.id, totalUnits: 8 },
    ],
  });

  // Keyboard — intentionally low to demo 409
  await prisma.warehouseStock.createMany({
    data: [
      { productId: keyboard.id, warehouseId: mumbai.id, totalUnits: 2 },
      { productId: keyboard.id, warehouseId: delhi.id, totalUnits: 1 },
    ],
  });

  // USB-C Hub — one warehouse only
  await prisma.warehouseStock.createMany({
    data: [
      { productId: hub.id, warehouseId: mumbai.id, totalUnits: 15 },
      { productId: hub.id, warehouseId: delhi.id, totalUnits: 0 },
    ],
  });

  console.log("✅ Seeding complete!");
  console.log(`   Warehouses: Mumbai Central, Delhi North`);
  console.log(`   Products: Wireless Headphones, Mechanical Keyboard, USB-C Hub`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
