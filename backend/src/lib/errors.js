export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg = "Bad request", details) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Please sign in to continue") => new HttpError(401, msg);
export const forbidden = (msg = "You don't have access to this") => new HttpError(403, msg);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);
export const unavailable = (msg) => new HttpError(503, msg);
