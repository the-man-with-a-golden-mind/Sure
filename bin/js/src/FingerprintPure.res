let joinParts = (parts: array<string>): string => {
  parts->Js.Array2.joinWith("\n")
}

let metaLine = (rel: string, size: int, mtime: int): string => {
  rel ++ "\t" ++ Belt.Int.toString(size) ++ "\t" ++ Belt.Int.toString(mtime)
}
