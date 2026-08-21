type result<'a> = {ok: bool, error: string, value: option<'a>}
let decodeManifest: string => result<string>
let decodeStamp: string => result<string>
