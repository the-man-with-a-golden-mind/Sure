let sureEmitSafe = (term: string): bool => {
  if term === "" {
    false
  } else if Js.String2.indexOf(term, "/") >= 0 || Js.String2.indexOf(term, "\\") >= 0 || Js.String2.indexOf(term, "..") >= 0 {
    false
  } else {
    %re("/^[A-Za-z][A-Za-z0-9._]*$/")->Js.Re.test_(term)
  }
}

let sureRelSafe = (rel: string): bool => {
  let t = rel->Js.String2.split("\\")->Js.Array2.joinWith("/")
  if t === "" || Js.String2.charAt(t, 0) === "/" || Js.String2.indexOf(t, ":") >= 0 {
    false
  } else {
    t
    ->Js.String2.split("/")
    ->Js.Array2.every(p => p !== "" && p !== "." && p !== "..")
  }
}
