-- Private, compressed JPEG attachments. Separate from the 5MB text sync payload.
-- Objects are immutable; deletion clears bytes and retains a small tombstone.
CREATE TABLE IF NOT EXISTS public.training_meal_photos (
  user_id text NOT NULL,
  object_key text NOT NULL,
  image_base64 text,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, object_key),
  CHECK (length(object_key) <= 250),
  CHECK ((deleted AND image_base64 IS NULL) OR
    (NOT deleted AND image_base64 IS NOT NULL AND length(image_base64) <= 245760))
);
ALTER TABLE public.training_meal_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_meal_photos FROM PUBLIC;
-- Server owner role only. Every query also scopes rows to the verified JWT subject.
