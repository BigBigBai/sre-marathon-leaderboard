-- Existing events stay unknown; network data is captured only on new event inserts.
ALTER TABLE events ADD COLUMN ip TEXT CHECK (ip IS NULL OR length(ip) <= 45);
ALTER TABLE events ADD COLUMN region TEXT CHECK (region IS NULL OR length(region) <= 128);
ALTER TABLE events ADD COLUMN city TEXT CHECK (city IS NULL OR length(city) <= 128);
CREATE INDEX events_ip_time ON events(ip,occurred_at) WHERE ip IS NOT NULL;
