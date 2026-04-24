import media/fingerprint/types.{MediaRecord}
import media/identity

pub fn instagram_image_identity_cache_key_test() {
  let media =
    MediaRecord(
      url: "https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/673114346_18169372003411061_3042644601223639018_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ig_cache_key=Mzg3OTM5NTMzOTIyODcyNzM0MQ%3D%3D.3-ccb7-5&ccb=7-5",
    )
  assert identity.instagram_image_identity(media) == Ok("3879395339228727341")
}

pub fn instagram_image_identity_filename_test() {
  let media =
    MediaRecord(
      url: "https://scontent-fra3-1.cdninstagram.com/v/t51.82787-19/540957724_17860675005471675_3845123663603315892_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby45NzQuYzIifQ&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103",
    )
  assert identity.instagram_image_identity(media)
    == Ok("540957724_17860675005471675_3845123663603315892")
}

pub fn instagram_video_identity_test() {
  let efg =
    "eyJ2ZW5jb2RlX3RhZyI6ImlnLXhwdmRzLmNsaXBzLmMyLUMzLmRhc2hfbG5faGVhYWNfdmJyM19hdWRpbyIsInZpZGVvX2lkIjpudWxsLCJvaWxfdXJsZ2VuX2FwcF9pZCI6OTM2NjE5NzQzMzkyNDU5LCJjbGllbnRfbmFtZSI6ImlnIiwieHB2X2Fzc2V0X2lkIjoxODU4MTIxNTM0ODA0NTI2MywiYXNzZXRfYWdlX2RheXMiOjAsInZpX3VzZWNhc2VfaWQiOjEwMDk5LCJkdXJhdGlvbl9zIjoxMCwiYml0cmF0ZSI6NjI5MzgsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D"
  let media =
    MediaRecord(
      url: "https://scontent-fra5-2.cdninstagram.com/o1/v/t2/f2/m78/AQOA6ca-ZX.mp4?efg="
      <> efg,
    )
  assert identity.instagram_video_identity(media) == Ok("18581215348045263")
}

pub fn instagram_video_id2_test() {
  let media =
    "https://scontent-fra5-2.cdninstagram.com/o1/v/t2/f2/m86/AQP-Af1udnhBerzHhsdsN3H5verWeJd_EP7lb1aflFKXFAWvTL7JjR80HdgLzzJG_pimwlIJ1UJGHuY829E8_gXzsn3kFOnrHZuJm8w.mp4?_nc_cat=107&_nc_sid=5e9851&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_ohc=D_xyk3BtiMYQ7kNvwGeCgnD&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTg1ODA5ODg2MjYwMDExOTcsImFzc2V0X2FnZV9kYXlzIjoyOSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjE3LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&vs=8e9a4808eb8a5079"
    |> MediaRecord
  assert identity.instagram_video_identity(media) == Ok("18580988626001197")
}
