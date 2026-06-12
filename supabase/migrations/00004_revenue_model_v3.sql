-- Revenue Model v3: 15% artist commission + flat $10 buyer fee +
-- artist-set shipping (passes through to artist). Pickup = no shipping.

ALTER TABLE listings ADD COLUMN shipping_rate_cents INT DEFAULT 0;
-- 0/NULL with pickup fulfillment = local pickup only / free shipping

ALTER TABLE listings ADD COLUMN price_visible BOOLEAN DEFAULT TRUE;
ALTER TABLE listings ADD COLUMN sold_price_cents INT;
ALTER TABLE listings ADD COLUMN show_sold_price BOOLEAN DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN buyer_fee_cents INT NOT NULL DEFAULT 1000;
ALTER TABLE orders ADD COLUMN shipping_cents INT NOT NULL DEFAULT 0;
