-- Seed inventory products from your product list
-- Run this with: psql -U postgres -d crm_db -f prisma/seed-inventory.sql

-- Clear existing products (optional - remove if you want to keep existing data)
-- DELETE FROM "InventoryProduct";

-- Insert products from your list
INSERT INTO "InventoryProduct" (id, sku, name, category, unit, "defaultPurchasePrice", "sellPrice", "currentStock", "lowStockThreshold", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'ZK-C3-100-G', 'ბოლტა ZK C3 100 (1 კანიბი)', 'HARDWARE', 'PIECE', 124.09, 150.00, 0, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'ZK-C3-400-G', 'ბოლტა ZK C3 400 (4 კანიბი)', 'HARDWARE', 'PIECE', 191.20, 230.00, 20, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'RTR-4G', 'როუტერი 4G', 'ROUTER', 'PIECE', 130.60, 160.00, 1, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'CTRL-001', 'კონტროლერი', 'CONTROLLER', 'PIECE', 261.85, 320.00, 24, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'BTN-EXIT', 'სარნტელზე ფიფიფ ღილაკ', 'ACCESSORY', 'PIECE', 90.00, 110.00, 1, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'BARRIER-001', 'ბარიერი', 'HARDWARE', 'PIECE', 10.79, 15.00, 339, 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'CABLE-BOLT-5', 'კაბელს ბოლოფე 5 ა', 'CABLE', 'METER', 12.00, 18.00, 1, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'MAGLOCK', 'მაგინილი ფიფიფ', 'HARDWARE', 'PIECE', 70.00, 95.00, 11, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'CTRL-BIO', 'კონტროლერ ბიომერი - (იაჟსცი)', 'CONTROLLER', 'PIECE', 60.00, 85.00, 75, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'CARD-RFID', 'კარის ბიფიფიჟა', 'ACCESSORY', 'PIECE', 17.00, 25.00, 7, 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'BARRIER-AUTO', 'ბილაბილნინსეცი ბიქსლი', 'HARDWARE', 'PIECE', 65.00, 90.00, 57, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'BARRIER-MOTOR', 'ბილაბილნინსეცი ძრავა (ფიფიფ)', 'HARDWARE', 'PIECE', 65.00, 90.00, 55, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'BTN-UNLOCK', 'სარნტელზე ფიფიფ ღილაკ', 'ACCESSORY', 'PIECE', 13.00, 20.00, 25, 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'NFC-QR', 'როცფსლ NFC QR', 'SENSOR', 'PIECE', 198.55, 250.00, 34, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'READER-HID', 'როცფსლ HID (აბლის)', 'SENSOR', 'PIECE', 118.14, 150.00, 1, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'READER-MATRIX', 'მაიირრიხპაი ფიფიფ', 'SENSOR', 'PIECE', 55.00, 75.00, 17, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'CTRL-BARRIER', 'ბილაბილნინსეცი ძრავა კვანა/ვინფსნბი', 'CONTROLLER', 'PIECE', 76.00, 100.00, 70, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'GSM-MOD', 'GSM ბოუსიილენბიბა', 'HARDWARE', 'PIECE', 80.00, 105.00, 21, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'INTERCOM-ANALOG', 'ფიფიფ კილაბილრიბია მაილოკე (სცნობროვსბია)', 'INTERCOM', 'PIECE', 25.00, 35.00, 0, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'INTERCOM-IP', 'კილაბილრიბია კილაბილრიბია მაილოკე', 'INTERCOM', 'PIECE', 5.00, 10.00, 11, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'DOORBELL', 'მაილოკე', 'ACCESSORY', 'PIECE', 12.00, 18.00, 0, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'CAMERA-LENS', 'ფილამოცისცი კამფსეარცევოა ბიქსხი', 'SENSOR', 'PIECE', 30.00, 45.00, 49, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'DOOR-CLOSER', 'დანცკისნციჟცემი ვალობრიგჟაბია ბიქსხი', 'HARDWARE', 'PIECE', 20.00, 30.00, 34, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'ZK-FINGER', 'კაბელს ბოლოფე კა კორბოამობრინსვობორესი (ფიფიფბორი)', 'CABLE', 'METER', 45.00, 60.00, 207, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'ZK-C3-100', 'ბოლტა ZK C3 100', 'HARDWARE', 'PIECE', 123.55, 150.00, 23, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'READER-EM', 'სცოვლობია უქს სასოთ', 'SENSOR', 'PIECE', 18.00, 25.00, 0, 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'CABLE-BOLT-12', 'კაბელს ბოლოფე 12 ა ფილცნლბოფილოფილბოფილი (აბლისა)', 'CABLE', 'METER', 20.00, 30.00, 22, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'CABLE-BOLT-12-EM', 'კაბელს ბოლოფე 12 5 ა ფილცნლბოფილოფილბოფილი', 'CABLE', 'METER', 17.00, 25.00, 0, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'CABLE-BOLT-5-EM', 'კაბელს ბოლოფე 5 ა ფილცნლბოფილოფილბოფილი', 'CABLE', 'METER', 17.00, 25.00, 3, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'CABLE-6', 'სცცებრია', 'CABLE', 'METER', 19.00, 28.00, 1, 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'DOORBELL-PANEL', 'ფილამოცისცი ბიჟკორი', 'ACCESSORY', 'PIECE', 50.00, 70.00, 10, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'CARD-READER-IP', 'კარის- ფიფიფბილბილა თბაქსი', 'SENSOR', 'PIECE', 9.90, 15.00, 32, 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'UPS-001', 'უქადცსბც (UPS)', 'HARDWARE', 'PIECE', 445.55, 550.00, 0, 3, true, NOW(), NOW()),
  (gen_random_uuid(), 'VERA-SMART', 'Vera Smart', 'CONTROLLER', 'PIECE', 197.78, 250.00, 24, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'CAMERA-SMART', 'მაცბილს კამრი სასექე', 'SENSOR', 'PIECE', 140.00, 180.00, 0, 5, true, NOW(), NOW()),
  (gen_random_uuid(), 'TEST-ITEM', 'test', 'OTHER', 'PIECE', 20.00, 30.00, 1, 5, true, NOW(), NOW());

-- Show results
SELECT
  sku,
  name,
  category,
  "defaultPurchasePrice" as purchase_price,
  "sellPrice" as sell_price,
  "currentStock" as stock
FROM "InventoryProduct"
ORDER BY name;
