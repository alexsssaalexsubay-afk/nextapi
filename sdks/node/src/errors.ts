export class NextAPIError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 0) {
    super(`[${code}] ${message}`);
    this.name = "NextAPIError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
