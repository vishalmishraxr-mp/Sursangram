export function ok(res, data = {}, message = "Operation completed", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function fail(res, message = "Something went wrong", status = 400, data = {}) {
  return res.status(status).json({ success: false, message, data });
}
