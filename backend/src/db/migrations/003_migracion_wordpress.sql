ALTER TABLE programs ADD COLUMN image_url text;
ALTER TABLE media ADD COLUMN source_url text UNIQUE;
ALTER TABLE content_items ADD COLUMN source_url text;
ALTER TABLE programs ADD COLUMN source_url text;
