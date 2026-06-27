import { db, usersTable, companiesTable, clientsTable, leadsTable, dealsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Check if admin already exists
  const existing = await db.select().from(usersTable).limit(1);
  if (existing.length > 0) {
    console.log("Seed data already exists, skipping.");
    process.exit(0);
  }

  const hash = await bcrypt.hash("admin123", 10);

  const [admin] = await db.insert(usersTable).values({
    email: "admin@toppingcourier.ca",
    name: "Alex Topping",
    passwordHash: hash,
    role: "CEO",
    slug: "alex",
    isActive: true,
  }).returning();
  console.log("Created admin user:", admin.email);

  const [salesRep] = await db.insert(usersTable).values({
    email: "sarah@toppingcourier.ca",
    name: "Sarah Johnson",
    passwordHash: await bcrypt.hash("password123", 10),
    role: "Sales_Rep",
    slug: "sarah",
    isActive: true,
  }).returning();

  const [closer] = await db.insert(usersTable).values({
    email: "mike@toppingcourier.ca",
    name: "Mike Chen",
    passwordHash: await bcrypt.hash("password123", 10),
    role: "Closer",
    slug: "mike",
    isActive: true,
  }).returning();

  console.log("Created team members.");

  // Companies
  const [acme] = await db.insert(companiesTable).values({ name: "Acme Logistics", industry: "Logistics", website: "https://acmelogistics.ca", phone: "416-555-0100" }).returning();
  const [northStar] = await db.insert(companiesTable).values({ name: "NorthStar Supply Co.", industry: "Supply Chain", website: "https://northstarsupply.ca" }).returning();
  const [pacific] = await db.insert(companiesTable).values({ name: "Pacific Distributors", industry: "Distribution", phone: "604-555-0200" }).returning();
  console.log("Created companies.");

  // Clients
  const [client1] = await db.insert(clientsTable).values({ name: "Jennifer Park", email: "j.park@acmelogistics.ca", phone: "416-555-0111", companyId: acme.id, status: "active", monthlyRevenue: "8500" }).returning();
  const [client2] = await db.insert(clientsTable).values({ name: "Robert Kim", email: "r.kim@northstarsupply.ca", companyId: northStar.id, status: "active", monthlyRevenue: "12000" }).returning();
  const [client3] = await db.insert(clientsTable).values({ name: "Maria Torres", email: "m.torres@pacific.ca", companyId: pacific.id, status: "prospect" }).returning();
  console.log("Created clients.");

  // Leads
  await db.insert(leadsTable).values([
    { name: "David Wilson", email: "david@globalcargo.ca", companyId: acme.id, stage: "qualified", source: "Cold call", ownerId: salesRep.id, value: "5000" },
    { name: "Emma Brown", email: "emma@fastfreight.ca", stage: "proposal", source: "Referral", ownerId: salesRep.id, value: "8000" },
    { name: "James Lee", email: "j.lee@quickship.ca", stage: "contacted", source: "Website", ownerId: closer.id, value: "3500" },
    { name: "Lisa Adams", email: "l.adams@citypost.ca", stage: "new", source: "LinkedIn", ownerId: salesRep.id },
  ]);
  console.log("Created leads.");

  // Deals
  await db.insert(dealsTable).values([
    { title: "Acme Annual Contract", stage: "closed_won", value: "102000", clientId: client1.id, companyId: acme.id, salesRepId: salesRep.id, closerId: closer.id, commissionStatus: "approved" },
    { title: "NorthStar Expansion", stage: "negotiation", value: "48000", clientId: client2.id, companyId: northStar.id, salesRepId: salesRep.id, commissionStatus: "pending" },
    { title: "Pacific Onboarding", stage: "proposal", value: "24000", clientId: client3.id, companyId: pacific.id, salesRepId: salesRep.id, commissionStatus: "pending" },
    { title: "GlobalCargo Pilot", stage: "qualification", value: "15000", salesRepId: salesRep.id, commissionStatus: "pending" },
    { title: "FastFreight Q4", stage: "prospecting", value: "30000", salesRepId: closer.id, commissionStatus: "pending" },
  ]);
  console.log("Created deals.");

  console.log("\nSeed complete!");
  console.log("Login: admin@toppingcourier.ca / admin123");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
