export function userPath(uid: string, ...segments: string[]) {
  return ["users", uid, ...segments].join("/");
}
