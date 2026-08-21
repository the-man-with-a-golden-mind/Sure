type request = {entry: string, theorems: array<string>, emit: string}

let empty = {entry: "", theorems: [], emit: "none"}

let requestOf = (raw: string): request => {
  if raw === "" {
    empty
  } else {
    try {
      let json = Js.Json.parseExn(raw)
      switch Js.Json.classify(json) {
      | JSONObject(dict) => {
          entry: switch Js.Dict.get(dict, "entry") {
          | Some(v) =>
            switch Js.Json.classify(v) {
            | JSONString(s) => s
            | _ => ""
            }
          | None => ""
          },
          theorems: [],
          emit: "none",
        }
      | _ => empty
      }
    } catch {
    | _ => empty
    }
  }
}

let namesOf = (req: request): array<string> => {
  if req.entry === "" {
    req.theorems
  } else {
    Js.Array2.concat([req.entry], req.theorems)
  }
}
