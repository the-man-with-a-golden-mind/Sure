type result<'a> = {ok: bool, error: string, value: option<'a>}

let fail = (code: string): result<'a> => {ok: false, error: code, value: None}
let ok = (v: 'a): result<'a> => {ok: true, error: "", value: Some(v)}

let decodeManifest = (text: string): result<string> => {
  if text === "" {
    fail("empty")
  } else {
    try {
      let json = Js.Json.parseExn(text)
      switch Js.Json.classify(json) {
      | JSONObject(_) => ok(text)
      | _ => fail("junk")
      }
    } catch {
    | _ => fail("junk")
    }
  }
}

let decodeStamp = (text: string): result<string> => {
  if text === "" {
    {ok: true, error: "", value: None}
  } else {
    decodeManifest(text)
  }
}
