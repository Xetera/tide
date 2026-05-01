import media/fingerprint/instagram
import media/fingerprint/shbdn
import media/fingerprint/types

pub type MediaRecord =
  types.MediaRecord

pub type IdentityError =
  types.IdentityError

pub fn instagram_image_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  instagram.image_identity(media)
}

pub fn instagram_video_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  instagram.video_identity(media)
}

pub fn shbdn_image_identity(
  media: types.MediaRecord,
) -> Result(String, types.IdentityError) {
  shbdn.image_identity(media)
}
