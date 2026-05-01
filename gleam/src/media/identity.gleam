import media/fingerprint
import media/fingerprint/types

pub type MediaRecord =
  types.MediaRecord

pub type IdentityError =
  types.IdentityError

pub fn instagram_image_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  fingerprint.instagram_image_identity(media)
}

pub fn instagram_video_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  fingerprint.instagram_video_identity(media)
}

pub fn shbdn_image_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  fingerprint.shbdn_image_identity(media)
}
