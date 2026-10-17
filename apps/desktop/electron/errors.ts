export class DesktopApplicationError extends Error {
  public readonly code: string;

  public constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name = 'DesktopApplicationError';
    this.code = code;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}