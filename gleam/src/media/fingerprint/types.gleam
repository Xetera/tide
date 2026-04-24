pub type MediaRecord {
  MediaRecord(url: String)
}

pub type IdentityError {
  IdentityError(message: String)
}

pub fn err(message: String) -> fn(a) -> IdentityError {
  fn(_) { IdentityError(message) }
}
