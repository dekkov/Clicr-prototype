-- migrations/014_venue_door_area_type.sql
-- Add VENUE_DOOR to the area_type CHECK constraint

ALTER TABLE areas
  DROP CONSTRAINT IF EXISTS areas_area_type_check;

ALTER TABLE areas
  ADD CONSTRAINT areas_area_type_check
  CHECK (area_type IN (
    'ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER', 'VENUE_DOOR'
  ));
