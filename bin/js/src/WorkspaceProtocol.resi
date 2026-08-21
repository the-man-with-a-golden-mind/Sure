type request = {entry: string, theorems: array<string>, emit: string}
let requestOf: string => request
let namesOf: request => array<string>
